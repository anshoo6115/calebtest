const Busboy = require('busboy');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

const snapchat = require('../../../lib/snapchat');
const logger = require('../../../lib/logger');

const constants = require('../../../utility/constants');
const utility = require('../../../utility/utils');

const snapchatAccountController = require('../account/account');
const model = require('./model');

const mediaUploadDir = path.join(__dirname, `${process.env.SNAPCHAT_MEDIA_UPLOAD_DIR}`);

utility.createDirectory(mediaUploadDir);

/* Validate file formats */
const validateFileFormat = (fileName, mimeType) => {
    try {
        if (fileName.length > 0) {
            if (constants.snapchat.media.validMimeTypes.find(type => type.includes(mimeType))) {
                return true;
            }
        }
        return false;
    } catch (err) {
        return err;
    }
};

/* Check uploaded media progress */
const checkUploadProgress = async (mediaId) => {
    try {
        return new Promise((resolve) => {
            let count = 0;
            const setTimeIntervalToCheckUploadStatus = setInterval(async () => {
                const snapchatAccessToken = await snapchatAccountController
                    .getSnapchatAccessToken();
                const response = await snapchat.getMedia(mediaId, snapchatAccessToken);
                if (response && response.media[0].media.media_status
                    === constants.snapchat.media.statusReady) {
                    clearInterval(setTimeIntervalToCheckUploadStatus);
                    resolve({
                        status: constants.responseStatus.success,
                        data: response,
                    });
                }
                if (count > 6) {
                    clearInterval(setTimeIntervalToCheckUploadStatus);
                    resolve({
                        status: constants.responseStatus.failure,
                    });
                }
                count += 1;
            }, 10000);
        }).catch((err) => {
            throw err;
        });
    } catch (err) {
        return err;
    }
};

/* Upload media data to snapchat */
const uploadMediaToSnapchat = async (mediaData, uploadMediaInfo) => {
    try {
        const snapchatAccessToken = await snapchatAccountController.getSnapchatAccessToken();

        const { media } = uploadMediaInfo[0];

        const uploadedMedia = await snapchat.uploadMedia(media.id, media.name,
            mediaData.filePath, snapchatAccessToken);

        if (uploadedMedia.request_status.toLowerCase()
                === constants.responseStatus.success) {
            const response = await checkUploadProgress(media.id);
            if (response.status === constants.responseStatus.success) {
                return response.data.media[0].media;
            }
        }
        return false;
    } catch (err) {
        return err;
    }
};

/* Create media in snapchat */
const createMediaAndUploadToSnapchat = async (mediaData, adAccount) => {
    try {
        const uploadFails = [];
        const uploadSuccess = [];
        const mediaInfo = [];
        if (mediaData.length > 0) {
            const snapchatAccessToken = await snapchatAccountController.getSnapchatAccessToken();

            await Promise.all(mediaData.map(async (md) => {
                const uploadData = [{
                    name: md.fileName,
                    type: md.mimeType.split('/')[0].toUpperCase(),
                    ad_account_id: adAccount.id,
                }];

                const uploadedMediaInfo = await snapchat.createMedia(uploadData,
                    snapchatAccessToken);

                if (uploadedMediaInfo && uploadedMediaInfo.request_status.toLowerCase()
                    === constants.responseStatus.success) {
                    const response = await uploadMediaToSnapchat(md,
                        uploadedMediaInfo.media, adAccount);
                    if (response) {
                        mediaInfo.push(response);
                        uploadSuccess.push(md.fileName);
                    } else {
                        uploadFails.push(md.fileName);
                    }
                } else {
                    uploadFails.push(md.fileName);
                }
            })).catch((err) => {
                throw err;
            });
            return {
                mediaInfo,
                uploadData: {
                    uploadFails,
                    uploadSuccess,
                    adAccountId: adAccount.id,
                },
            };
        }
        return {
            mediaInfo,
            uploadData: {
                uploadFails,
                uploadSuccess,
                adAccountId: adAccount.id,
            },
        };
    } catch (err) {
        return err;
    }
};

/* Save media data into database */
const saveMediaData = async (mediaUploadMapper, adAccount, mediaProperties, uploadedMediaInfo) => {
    try {
        const mediaPropertiesToUpdate = mediaProperties;
        return await Promise.all(mediaUploadMapper.map(async (media) => {
            const snapMediaId = uploadedMediaInfo.filter(
                uploadedMedia => uploadedMedia.name === media.name,
            )[0].id;
            mediaPropertiesToUpdate.snapMediaId = snapMediaId;
            await model.saveSnapchatMedia(media.id, media, adAccount, mediaPropertiesToUpdate);
        }));
    } catch (err) {
        return err;
    }
};

/* Update media with ad accounts */
const updateMediaWithAdAccounts = async (uploadedMediaInfo, adAccounts, mediaProperties,
    mediaData) => {
    try {
        const uploadStatus = [];
        await Promise.all(adAccounts.map(async (adAccount) => {
            const status = await createMediaAndUploadToSnapchat(mediaData, adAccount);
            uploadStatus.push(status.uploadData);
            await saveMediaData(uploadedMediaInfo, adAccount, mediaProperties, status.mediaInfo);
        })).catch((err) => {
            throw err;
        });
        return uploadStatus;
    } catch (err) {
        return err;
    }
};

/* Upload media with first ad account and update db then upload remaining */
const initiateMediaUploadProcess = async (mediaData, adAccounts, mediaProperties) => {
    try {
        let uploadStatus = [];

        const uploadResponse = await createMediaAndUploadToSnapchat(mediaData, adAccounts[0]);
        uploadStatus.push(uploadResponse.uploadData);

        const mediaUploadMapper = uploadResponse.mediaInfo;

        if (mediaUploadMapper && mediaUploadMapper.length > 0) {
            await saveMediaData(mediaUploadMapper, adAccounts[0], mediaProperties,
                mediaUploadMapper);

            const remainingAdAccounts = adAccounts.filter(
                adAccount => adAccounts[0].id !== adAccount.id,
            );

            const remainingAdaccountsUploadStatus = await
            updateMediaWithAdAccounts(mediaUploadMapper, remainingAdAccounts, mediaProperties,
                mediaData);

            uploadStatus = uploadStatus.concat(remainingAdaccountsUploadStatus);
        }
        return uploadStatus;
    } catch (err) {
        throw err;
    }
};

/* Parse upload media request */
const uploadMedia = async (req, res) => {
    try {
        const busboyParser = new Busboy({
            headers: req.headers,
            limits: {
                fileSize: constants.snapchat.media.maxUploadSizeInBytes,
            },
        });

        req.pipe(busboyParser);

        const invalidFileSizes = [];
        const invalidFileTypes = [];
        let adAccounts = [];

        let mediaData = [];
        const mediaProperties = {};

        const parseFormField = (fieldName, value) => {
            try {
                if (fieldName === 'adAccount') {
                    adAccounts = JSON.parse(value);
                } else {
                    mediaProperties[fieldName] = value;
                }
                return adAccounts;
            } catch (err) {
                return err;
            }
        };

        const parseFile = (fieldName, file, fileName, encoding, mimeType) => {
            try {
                const filePath = path.join(mediaUploadDir, `/${fileName}`);

                if (validateFileFormat(fileName, mimeType)) {
                    file.on('limit', () => {
                        invalidFileSizes.push(fileName);
                        fs.unlink(filePath);
                        mediaData = mediaData.filter(item => item.fileName !== fileName);
                        return mediaData;
                    });

                    mediaData.push({
                        filePath,
                        fileName,
                        mimeType,
                    });

                    return file.pipe(fs.createWriteStream(filePath));
                }
                invalidFileTypes.push(fileName);
                return file.resume();
            } catch (err) {
                return err;
            }
        };

        const finishUpload = async () => {
            try {
                let uploadStatus = [];
                if (adAccounts.length > 0) {
                    uploadStatus = await initiateMediaUploadProcess(mediaData, adAccounts,
                        mediaProperties);

                    utility.deleteFilesFromDirectory(mediaUploadDir, mediaData);
                }

                return res.status(200).json({
                    uploadStatus,
                    invalidFileSizes,
                    invalidFileTypes,
                });
            } catch (err) {
                return err;
            }
        };

        busboyParser.on('field', parseFormField);

        busboyParser.on('file', parseFile);

        busboyParser.on('finish', finishUpload);

        return true;
    } catch (err) {
        logger.error(err.message);
        return res.sendStatus(500);
    }
};

/* List all media by media view */
const listMedia = async (req, res) => {
    try {
        const { mediaView } = req.params;
        const mediaList = await model.getSnapchatMediaByViewType(mediaView);
        return res.status(200).json({
            status: constants.responseStatus.success,
            data: mediaList.Items,
        });
    } catch (err) {
        logger.error(err.message);
        return res.sendStatus(500);
    }
};

/* Process link media to ad acconts */
const processLinkAdAccounts = async (mediaId, adAccounts) => {
    try {
        let uploadStatus = [];
        const media = await model.getSnapchatMedia(mediaId);
        if (media.Count > 0) {
            const filePath = path.join(mediaUploadDir, `/${media.Items[0].mediaName}`);
            await utility.downloadFile(media.Items[0].mediaDownloadLink, filePath);
            const mediaData = [
                {
                    filePath,
                    fileName: `${media.Items[0].mediaName}`,
                    mimeType: mime.lookup(filePath),
                },
            ];
            const uploadedMediaInfo = [{
                id: media.Items[0].id,
                name: media.Items[0].mediaName,
            }];
            uploadStatus = await updateMediaWithAdAccounts(uploadedMediaInfo, adAccounts, {},
                mediaData);
            utility.deleteFilesFromDirectory(mediaUploadDir, mediaData);
        }
        return uploadStatus;
    } catch (err) {
        return err;
    }
};

/* Link media to ad accounts */
const linkMediaToAdAccounts = async (req, res) => {
    try {
        const { mediaId } = req.body;
        const { adAccounts } = req.body;

        const response = await processLinkAdAccounts(mediaId, adAccounts);
        return res.status(200).json(response);
    } catch (err) {
        logger.error(err.message);
        return res.sendStatus(500);
    }
};

module.exports = {
    uploadMedia,
    validateFileFormat,
    checkUploadProgress,
    uploadMediaToSnapchat,
    createMediaAndUploadToSnapchat,
    listMedia,
    linkMediaToAdAccounts,
};

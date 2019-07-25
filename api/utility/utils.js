const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const constants = require('./constants');

const accountVerificationBaseUrl = process.env.ACCOUNT_VERIFICATION_BASE_URL;

/* Return user verification token */
const getVerificationToken = (name, email) => {
    try {
        const token = crypto.createHash('sha256').update(`${name}${email}${Date.now()}`).digest('hex');
        return token;
    } catch (err) {
        throw err;
    }
};

/* Return user verification link */
const getVerificationLink = (token) => {
    try {
        return `${accountVerificationBaseUrl}${token}`;
    } catch (err) {
        throw err;
    }
};

/* Check link validity */
const checkLinkValidity = (timeSent) => {
    try {
        const verifyLinkSentTime = new Date(timeSent).valueOf();
        const currentTime = new Date().valueOf();
        const verificationLinkValidityInSec = 3600000 * constants.verificationLinkValidityHrs;

        return (currentTime - verifyLinkSentTime) < (verificationLinkValidityInSec);
    } catch (err) {
        throw err;
    }
};

/* Create new directory */
const createDirectory = (dirPath) => {
    try {
        if (fs.existsSync(dirPath)) {
            return false;
        }
        fs.mkdirSync(dirPath);
        return true;
    } catch (err) {
        throw err;
    }
};

/* delete files from directory */
const deleteFilesFromDirectory = (dirPath, files) => {
    try {
        files.forEach((file) => {
            const filePath = path.join(dirPath, file.fileName);
            if (fs.existsSync(filePath)) {
                fs.unlink(filePath, (err) => {
                    if (err) throw err;
                });
            }
        });
    } catch (err) {
        throw err;
    }
};

/* Download file from any url and save destination location */
const downloadFile = (url, destination) => {
    const file = fs.createWriteStream(destination);
    return new Promise((resolve) => {
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        });
    }).catch((err) => {
        throw err;
    });
};


module.exports = {
    getVerificationToken,
    getVerificationLink,
    checkLinkValidity,
    createDirectory,
    deleteFilesFromDirectory,
    downloadFile,
};

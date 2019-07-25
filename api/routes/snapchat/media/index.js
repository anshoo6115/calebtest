const express = require('express');

const controller = require('./media');

const router = express.Router();

/**
 * @swagger
 * securityDefinitions:
 *   Bearer:
 *     type: apiKey
 *     name: Authorization
 *     in: header
 * /snapchat/media/upload:
 *   post:
 *     security:
 *       - Bearer: []
 *     description: Upload media file
 *     tags:
 *       - snapchat/media
 *     consumes:
 *       - multipart/form-data
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: upfile[]
 *         description: Upload media files
 *         in: formData
 *         type: file
 *         required: true
 *       - name: adAccount
 *         description: List of ad accounts with id and name
 *         in: formData
 *         type: array
 *         items:
 *           - $ref: '#/definitions/adAccount'
 *         required: true
 *       - name: mediaView
 *         description: Media display view
 *         in: formData
 *         type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Media uploaded successfully
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * definition:
 *   adAccount:
 *     properties:
 *       id:
 *         type: string
 *       name:
 *         type: string
 */
router.post('/upload', controller.uploadMedia);

/**
 * @swagger
 * securityDefinitions:
 *   Bearer:
 *     type: apiKey
 *     name: Authorization
 *     in: header
 * /snapchat/media/{mediaView}:
 *   get:
 *     security:
 *       - Bearer: []
 *     description: Display media with given view
 *     tags:
 *       - snapchat/media
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: mediaView
 *         description: Display view of media
 *         in: path
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: list media by given view
 *       500:
 *         description: Internal server error
 */
router.get('/:mediaView', controller.listMedia);

/**
 * @swagger
 * securityDefinitions:
 *   Bearer:
 *     type: apiKey
 *     name: Authorization
 *     in: header
 * /snapchat/media/link:
 *   post:
 *     security:
 *       - Bearer: []
 *     description: List ad accounts
 *     tags:
 *       - snapchat/media
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: body
 *         description: link media to adAccounts
 *         in: body
 *         required: true
 *         schema:
 *           $ref: '#/definitions/linkAccounts'
 *     responses:
 *       200:
 *         description: link media to ad accounts successfully.
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * definition:
 *   linkAccounts:
 *     properties:
 *       mediaId:
 *         type: string
 *       adAccounts:
 *         type: array
 *         items:
 *           - $ref: '#/definitions/adAccount'
 */

/**
 * @swagger
 * definition:
 *   adAccount:
 *     properties:
 *       id:
 *         type: string
 *       name:
 *         type: string
 */
router.post('/link', controller.linkMediaToAdAccounts);


module.exports = router;

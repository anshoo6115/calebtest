const nodemailer = require('nodemailer');
const smtpTransport = require('nodemailer-smtp-transport');

const logger = require('../logger');

let transporter = null;
if (process.env.NODE_ENV !== 'production') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const mailConfig = {
        host: process.env.DEV_MAIL_HOST,
        port: process.env.DEV_MAIL_PORT,
        auth: {
            user: process.env.DEV_MAIL_USERNAME,
            pass: process.env.DEV_MAIL_PASSWORD,
        },
    };
    transporter = nodemailer.createTransport(mailConfig);
} else {
    const mailConfig = {
        service: process.env.PROD_MAIL_SERVICE,
        host: process.env.PROD_MAIL_HOST,
        auth: {
            user: process.env.PROD_MAIL_USERNAME,
            pass: process.env.PROD_MAIL_PASSWORD,
        },
    };
    transporter = nodemailer.createTransport(smtpTransport(mailConfig));
}

const sendMail = (message) => {
    const email = message;

    email.from = process.env.NODE_ENV !== 'production'
        ? process.env.DEV_MAIL_FROM : process.env.PROD_MAIL_FROM;

    return new Promise((resolve, reject) => {
        transporter.sendMail(email)
            .then(() => {
                resolve(true);
            }).catch(() => {
                reject();
            });
    }).catch((err) => {
        logger.error(err.message);
        return err;
    });
};

module.exports = {
    sendMail,
};

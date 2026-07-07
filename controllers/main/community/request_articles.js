const express = require('express')
const router = express.Router()
const { getPresentDateTime, arrangeValidation, validateAndSaveImage } = require('../../../utils/helpers/helper')
const { checkUserLoginToken } = require('../../../middleware/authorization')
const { check, validationResult } = require('express-validator')
const community_article_requestsM = require('../../../models/main/community/community_article_requestsM')

router.post('/publish_request', [
    check('topic').notEmpty().withMessage('Topic is required.'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        const errObj = arrangeValidation(errors);
        if (Object.keys(errObj).length > 0) {
            return res.json({ status: false, message: errObj });
        }

        const checkToken = checkUserLoginToken(req.headers);
        if (!checkToken.status) {
            return res.json({
                status: false,
                message: { alert_message: checkToken.message }
            });
        }

        const user_row_id = checkToken.message;
        const { topic, document_link, article_content } = req.body;

        if (!document_link?.trim() && !article_content?.trim()) {
            return res.json({
                status: false,
                message: { alert_message: "Please provide either a document link or article content." }
            });
        }

        const newRequest = new community_article_requestsM({
            user_row_id,
            topic,
            document_link: document_link || '',
            article_content: article_content || '',
            status: 'pending',
            date_n_time: getPresentDateTime()
        });

        await newRequest.save();

        return res.json({
            status: true,
            message: { alert_message: "Publish Article successfully requested." }
        });

    } catch (err) {
        return res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err?.message
        });
    }
});


module.exports = router
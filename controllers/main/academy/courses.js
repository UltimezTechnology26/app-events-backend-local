const express = require('express')
const router = express.Router()
const { getCourseList } = require('../../../services/main/course')

router.get('/list/:skip/:limit', async (req, res) => {
    try {
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

        const result = await getCourseList(
            skip,
            limit,
            req.query.date,
            req.query.search
        );

        res.json(result);
    }
    catch (err) {
        console.log('course list error:', err.message);
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message });
    }
});

module.exports = router

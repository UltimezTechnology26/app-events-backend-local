const express = require('express')
const router = express.Router()
const { getBenefitsDetails } = require('../../../services/main/benefits');

router.get('/details', async (req, res) => {
    try {
        const result = await getBenefitsDetails(req.headers);

        if (!result.status) {
            return res.status(401).json(result);
        }

        return res.json(result);

    } catch (err) {
        console.error("❌ Error in /details route:", err);
        return res.status(500).json({
            status: false,
            message: "Something went wrong while fetching user details.",
            err: err?.message
        });
    }
});

module.exports = router
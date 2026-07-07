const express = require('express')
const router = express.Router()

const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../middleware/authorization')

const company_exchanges_countriesM = require('../../../models/app/company/company_exchanges_countriesM')
const company_regulatory_typesM = require('../../../models/app/company/company_regulatory_typesM')
const companyM = require('../../../models/app/company/companyM')
const company_exchanges_bodiesM = require('../../../models/app/company/company_exchanges_bodiesM')
const sanitize = require('mongo-sanitize')


router.post('/save_n_edit', [
    check('regulator_type_name')
        .trim().not().isEmpty().withMessage('The category name field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        let category_row_id = 0
        if (req.body.category_row_id) {
            category_row_id = Number.parseInt(req.body.category_row_id)

            const checkRegularities = await company_regulatory_typesM.findOne({ _id: category_row_id })
            if (!checkRegularities) {
                errObj['category_row_id'] = "Invalid category row id"
            }
        }
        let regulator_type_name = ""
        if (req.body.regulator_type_name) {
            regulator_type_name = sanitize(req.body.regulator_type_name)
            const check_query = await company_regulatory_typesM.findOne({ _id: { $ne: category_row_id }, regulator_type_name: regulator_type_name }, { _id: 1 }).collation({ locale: 'en', strength: 2 })
            if (check_query) {
                errObj['regulator_type_name'] = 'Sorry, This Regulatory type  already exist.'
            }
        }
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else if (category_row_id > 0) {
                await company_regulatory_typesM.updateOne({ _id: category_row_id }, { $set: { regulator_type_name: regulator_type_name } })

                res.json({ status: true, message: { alert_message: "This Regularity type details has been updated successfully." }, tokenStatus: true })
            }
            else {
                await company_regulatory_typesM({ regulator_type_name: regulator_type_name, date_n_time: getPresentDateTime() }).save()

                res.json({ status: true, message: { alert_message: "New Regularity type details has been added successfully." }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Save and edit Regularities .', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/delete_type/:category_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const category_row_id = Number.parseInt(req.params.category_row_id)

            const checkQuery = await company_regulatory_typesM.findOne({ _id: category_row_id })
            if (checkQuery) {

                const check_bodies = await company_exchanges_bodiesM.findOne({
                    regulatory_type_id: category_row_id
                });

                if (check_bodies) {
                    return res.json({
                        status: false,
                        message: { alert_message: "Sorry, regulatory type is used in bodies, cannot delete." },
                        tokenStatus: true
                    });
                }

                await company_regulatory_typesM.deleteOne({ _id: category_row_id });

                return res.json({
                    status: true,
                    message: { alert_message: "This regulatory type details has been deleted successfully." },
                    tokenStatus: true
                });
            }

            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid regulatory type id " }, tokenStatus: true })
            }

        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Delete regularity details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.post('/save_n_edit_bodies', [
    check('regulatory_bodies_name')
        .trim().not().isEmpty().withMessage('The regulatory body name field is required.'),
    check('country_id')
        .not().isEmpty().withMessage('The country ID is required.')
        .isInt().withMessage('The country ID must be a valid number.'),
    check('regulatory_type_id')
        .not().isEmpty().withMessage('The regulatory type id is required.')
        .isInt().withMessage('The regulatory type id must be a valid number.'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        const errObj = arrangeValidation(errors);

        let category_row_id = 0;
        if (req.body.category_row_id) {
            category_row_id = Number.parseInt(req.body.category_row_id);

            const checkRegularities = await company_exchanges_bodiesM.findOne({ _id: category_row_id });
            if (!checkRegularities) {
                errObj['category_row_id'] = "Invalid category row id";
            }
        }

        const checkToken = checkAdminLoginToken(req.headers, [0]);
        if (!checkToken.status) return res.json(checkToken);

        if (Object.keys(errObj).length > 0) {
            return res.json({ status: false, message: errObj });
        }

        const { regulatory_bodies_name, country_id, regulatory_type_id } = req.body;
        const parsed_country_id = Number.parseInt(country_id);
        const parsed_type_id = Number.parseInt(regulatory_type_id);

        const existingCountry = await company_exchanges_countriesM.findOne({ country_id: parsed_country_id });
        if (!existingCountry) {
            await new company_exchanges_countriesM({
                country_id: parsed_country_id,
            }).save();
        }

        const duplicateQuery = {
            regulatory_bodies_name: regulatory_bodies_name.trim(),
            country_id: parsed_country_id
        };
        if (category_row_id > 0) {
            duplicateQuery._id = { $ne: category_row_id };
        }


        if (category_row_id > 0) {
            duplicateQuery._id = { $ne: category_row_id };
        }

        const duplicateExists = await company_exchanges_bodiesM.findOne(duplicateQuery);

        if (duplicateExists) {
            return res.json({
                status: false,
                message: {
                    regulatory_bodies_name: "This regulatory body already exists for the selected country."
                },
                tokenStatus: true
            });
        }


        if (category_row_id > 0) {
            await company_exchanges_bodiesM.updateOne(
                { _id: category_row_id },
                {
                    $set: {
                        regulatory_bodies_name: regulatory_bodies_name.trim(),
                        country_id: parsed_country_id,
                        regulatory_type_id: parsed_type_id,
                        // date_n_time: getPresentDateTime()
                    }
                }
            );
            return res.json({
                status: true,
                message: { alert_message: "This regulatory body detail has been updated successfully." },
                tokenStatus: true
            });
        } else {
            await new company_exchanges_bodiesM({
                regulatory_bodies_name: regulatory_bodies_name.trim(),
                country_id: parsed_country_id,
                regulatory_type_id: parsed_type_id,
                date_n_time: getPresentDateTime()
            }).save();

            return res.json({
                status: true,
                message: { alert_message: "New regulatory body detail has been added successfully." },
                tokenStatus: true
            });
        }

    } catch (err) {
        console.log('Save and edit regulatory bodies error:', err.message);
        return res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        });
    }
});




router.get('/delete_bodies/:category_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0]);
        if (!checkToken.status) return res.json(checkToken);

        const category_row_id = Number.parseInt(req.params.category_row_id);

        const bodyRecord = await company_exchanges_bodiesM.findOne({ _id: category_row_id });
        if (!bodyRecord) {
            return res.json({
                status: false,
                message: { alert_message: "Sorry, Invalid regulatory body ID." },
                tokenStatus: true
            });
        }

        const checkCategoryInUse = await companyM.findOne({
            "regularities_details.regulatory_bodies_ids": category_row_id
        });

        if (checkCategoryInUse) {
            return res.json({
                status: false,
                message: { alert_message: "Sorry, regulatory body is in use, cannot delete." },
                tokenStatus: true
            });
        }

        const { country_id } = bodyRecord;

        await company_exchanges_bodiesM.deleteOne({ _id: category_row_id });

        const remainingBodies = await company_exchanges_bodiesM.countDocuments({ country_id });

        if (remainingBodies === 0) {
            await company_exchanges_countriesM.deleteOne({ country_id: Number.parseInt(country_id) });
        }

        return res.json({
            status: true,
            message: { alert_message: "Regulatory body deleted successfully." },
            tokenStatus: true
        });

    } catch (err) {
        console.log('Delete regulatory body error:', err.message);
        return res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        });
    }
});







module.exports = router
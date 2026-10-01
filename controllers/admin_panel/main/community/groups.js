require('dotenv').config()
const express = require('express')
const { check, validationResult } = require('express-validator')
const router = express.Router()
const { checkAdminLoginToken } = require('../../../../middleware/authorization')
const { arrangeValidation, getPresentDateTime, validateAndSaveImage } = require('../../../../utils/helpers/helper')
const { getCollectionID } = require('../../../../utils/helpers/database_helper')
const community_groupsM = require('../../../../models/main/community/community_groupsM')

// A freshly picked icon arrives as a base64 `data:image/...` URL, which is the only input
// `validateAndSaveImage` can decode. On UPDATE the admin panel echoes the group's existing stored
// FILENAME back as `icon` when no new file was picked (the route's own validator requires `icon`
// to be non-empty on every call, so the client has nothing else to send). CONFIRMED BUG FIX:
// that filename used to be pushed through `validateAndSaveImage` too, whose `decodeImage` returns
// `false` for anything that isn't a data URL - so every rename/hashtag edit without a re-upload
// was rejected with "Invalid group icon image", and the `delete saveObject.icon` keep-existing
// branch below was unreachable. Now only a data URL is validated/uploaded; a non-data-URL icon on
// an update means "keep the current icon", and on a create it is still rejected (a new group
// needs a real image).
const NEW_ICON_DATA_URL_PATTERN = /^data:image\//
const INVALID_ICON_MESSAGE = 'Sorry, Invalid group icon image.'

router.post('/add_n_update_details', [
    check('name').trim().notEmpty().withMessage('Group name is required.'),
    check('hashtag').trim().notEmpty().withMessage('Hashtag is required.'),
    check('icon').trim().notEmpty().withMessage('Icon is required.'),
    check('group_id').optional().isInt().withMessage('Group ID must be an integer.')
], async (req, res) => {
    const errors = validationResult(req);
    try {


        const errObj = arrangeValidation(errors);

        const checkToken = checkAdminLoginToken(req.headers, [13]);
        if (!checkToken.status) errObj['alert_message'] = checkToken.message;

        let icon = "";
        if (!Object.keys(errObj).length) {
            const isNewIcon = NEW_ICON_DATA_URL_PATTERN.test(req.body.icon);
            if (isNewIcon) {
                const validate_n_save_image = await validateAndSaveImage(req.body.icon, 10);
                if (!validate_n_save_image.status) {
                    errObj['icon'] = INVALID_ICON_MESSAGE;
                } else {
                    icon = validate_n_save_image.webp_file_name;
                }
            } else if (!req.body.group_id) {
                errObj['icon'] = INVALID_ICON_MESSAGE;
            }
            // else: update with the existing filename - `icon` stays "" so the current icon is kept below
        }

        if (Object.keys(errObj).length > 0) {
            return res.json({ status: false, message: errObj });
        }

        const saveObject = {
            name: req.body.name,
            hashtag: req.body.hashtag,
            icon: icon,
        };

        if (req.body.group_id) {
            const group = await community_groupsM.findOne({ _id: Number.parseInt(req.body.group_id) });
            if (!group) {
                return res.json({ status: false, message: { alert_message: 'Group not found for update.' } });
            }

            if (!icon) delete saveObject.icon;

            await community_groupsM.updateOne({ _id: Number.parseInt(req.body.group_id) }, { $set: saveObject });

            return res.json({ status: true, message: { alert_message: 'Group updated successfully.' } });

        } else {
            const _id = await getCollectionID('cln_community_groups');
            saveObject._id = _id;
            saveObject.date = getPresentDateTime();
            const existingGroup = await community_groupsM.findOne({ hashtag: req.body.hashtag });
            if (existingGroup) {
                return res.json({ status: false, message: { alert_message: 'Group already exists.' } });
            }


            await community_groupsM(saveObject).save();

            return res.json({ status: true, message: { alert_message: 'Group created successfully.' } });
        }
    } catch (error) {
        res.json({
            status: false,
            message: { alert_message: "Server Error" },
            error: error?.message
        })
    }
});

router.get('/group_list', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13]);
        if (checkToken.status) {
            const groups = await community_groupsM.find({}, { _id: 1, name: 1, hashtag: 1, icon: 1, date: 1 }).sort({ _id: 1 });
            return res.json({ status: true, message: groups });
        } else {
            res.json({
                status: false,
                message: { alert_message: checkToken.message }
            })
        }
    } catch (error) {
        res.json({
            status: false,
            message: { alert_message: "Server Error" },
            error: error?.message
        })
    }
});


router.get('/delete_group/:group_id', async (req, res) => {
    try {
        const groupId = Number.parseFloat(req.params.group_id)
        if (!Number.isNaN(groupId)) {
            const errors = validationResult(req);
            const errObj = arrangeValidation(errors);

            const checkToken = checkAdminLoginToken(req.headers, [13]);
            if (!checkToken.status) errObj['alert_message'] = checkToken.message;
            const existingGroup = await community_groupsM.findOne({ _id: groupId });
            if (!existingGroup) errObj['alert_message'] = "Group not found.";

            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj });
            }

            await community_groupsM.deleteOne({ _id: groupId });

            return res.json({ status: true, message: { alert_message: "Group deleted successfully." } });
        } else {
            res.json({
                status: false,
                message: { alert_message: "Sorry, Invalid Group ID." }
            })
        }
    } catch (error) {
        res.json({
            status: false,
            message: { alert_message: "Server Error" },
            error: error?.message
        })
    }
});

module.exports = router
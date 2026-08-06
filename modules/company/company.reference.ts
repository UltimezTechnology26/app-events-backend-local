// modules/company/company.reference.ts
//
// Shared regulatory/reference-data lookups, relocated verbatim from
// controllers/app/company/front_page.js (Part 3 §7 Phase H step 14). No
// behavior change. Confirmed live via direct frontend trace — both
// frontend-appcp-typescript and admin-coinpedia call these exact backend
// paths (admin proxies straight through to the same app-mounted route rather
// than having its own admin_panel copy), so these stay app-only, single
// mount, matching their existing wiring.
const companyM = require('../../models/app/company/companyM')
const countryM = require('../../models/app/static/countryM')
const company_regulatory_typesM = require('../../models/app/company/company_regulatory_typesM')
const company_exchanges_bodiesM = require('../../models/app/company/company_exchanges_bodiesM')

export const getRegulatoriesList = async (companyRowIdParam: any) => {
    const company_row_id = Number.parseInt(companyRowIdParam || 0);
    const pipeline: any[] = [];

    if (company_row_id) {
        pipeline.push({ $match: { _id: company_row_id } });
    }

    pipeline.push(
        { $unwind: "$regularities_details" },
        {
            $lookup: {
                from: "cln_exchange_bodies",
                localField: "regularities_details.regulatory_bodies_ids",
                foreignField: "_id",
                as: "regulatory_bodies_info"
            }
        },
        {
            $unwind: { path: "$regulatory_bodies_info", preserveNullAndEmptyArrays: true }
        },
        {
            $lookup: {
                from: "cln_static_countries",
                localField: "regulatory_bodies_info.country_id",
                foreignField: "_id",
                as: "country_info"
            }
        },
        {
            $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true }
        },
        {
            $lookup: {
                from: "cln_company_regulatory_types",
                localField: "regulatory_bodies_info.regulatory_type_id",
                foreignField: "_id",
                as: "regulatory_type_info"
            }
        },
        {
            $unwind: { path: "$regulatory_type_info", preserveNullAndEmptyArrays: true }
        },

        {
            $group: {
                _id: "$_id",
                company_name: { $first: "$company_name" },
                regularities_details: {
                    $push: {
                        country_id: "$regulatory_bodies_info.country_id",
                        regulatory_bodies_ids: "$regularities_details.regulatory_bodies_ids",
                        regulatory_types_id: "$regulatory_bodies_info.regulatory_type_id",
                        country_name: "$country_info.country_name",
                        country_flag: "$country_info.country_flag",
                        regulator_type_name: "$regulatory_type_info.regulator_type_name",
                        regulatory_body_name: "$regulatory_bodies_info.regulatory_bodies_name"
                    }
                }
            }
        },

        { $sort: { _id: -1 } }
    );

    return companyM.aggregate(pipeline);
}

export const getExchangesCountries = async () => {
    return countryM.aggregate([

        {
            $lookup: {
                from: "cln_exchanges_static_countries",
                localField: "_id",
                foreignField: "country_id",
                as: "country_info"
            }
        },

        {
            $lookup: {
                from: "cln_exchange_bodies",
                localField: "_id",
                foreignField: "country_id",
                as: "regulatory_info"
            }
        },

        // ensure country exists in exchanges table
        { $match: { country_info: { $ne: [] } } },

        // optional: ensure country exists in regulatory bodies
        { $match: { regulatory_info: { $ne: [] } } },

        { $unwind: "$country_info" },

        { $sort: { "country_info._id": 1 } },

        {
            $project: {
                _id: 1,
                country_code: 1,
                country_name: 1,
                country_flag: 1,
                currency_code: 1,
                has_regulatory_body: {
                    $cond: [
                        { $gt: [{ $size: "$regulatory_info" }, 0] },
                        1,
                        0
                    ]
                }
            }
        }
    ]);
}

export const getRegulatoriesTypesList = async (search: any) => {
    let matchStage: any = {};
    if (search?.trim()) {
        matchStage.regulator_type_name = {
            $regex: search.trim(),
            $options: "i"
        };
    }
    return company_regulatory_typesM.aggregate([
        {
            $match: matchStage
        },
        {

            $lookup: {
                from: "cln_exchange_bodies",
                let: { type_id: "$_id" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $eq: ["$regulatory_type_id", "$$type_id"]
                            }
                        }
                    },
                    {
                        $lookup: {
                            from: "cln_company_lists",
                            let: { body_id: "$_id" },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $in: [
                                                "$$body_id",
                                                { $ifNull: ["$regularities_details.regulatory_bodies_ids", []] }
                                            ]
                                        }
                                    }
                                }
                            ],
                            as: "companies"
                        }
                    },
                    {
                        $unwind: "$companies"

                    }
                ],
                as: "companies"
            }
        },

        {
            $addFields: {
                pending_count: {
                    $size: {
                        $filter: {
                            input: "$companies",
                            as: "c",

                            cond: {
                                $and: [
                                    { $eq: ["$$c.approval_status", 0] },
                                    { $eq: ["$$c.active_status", 1] }
                                ]
                            }
                        }
                    }
                },
                approved_count: {
                    $size: {
                        $filter: {
                            input: "$companies",
                            as: "c",
                            cond: {
                                $and: [
                                    { $eq: ["$$c.approval_status", 1] },
                                    { $eq: ["$$c.active_status", 1] }
                                ]
                            }
                        }
                    }
                },
                rejected_count: {
                    $size: {
                        $filter: {
                            input: "$companies",
                            as: "c",
                            cond: { $eq: ["$$c.approval_status", 2] }
                        }
                    }
                },
                disabled_count: {
                    $size: {
                        $filter: {
                            input: "$companies",
                            as: "c",
                            cond: { $eq: ["$$c.active_status", 0] }
                        }
                    }
                },
                deleted_count: {
                    $size: {
                        $filter: {
                            input: "$companies",
                            as: "c",
                            cond: { $eq: ["$$c.active_status", 2] }
                        }
                    }
                }
            }
        },

        {
            $project: {
                companies: 0
            }
        },
        {
            $project: {
                _id: 1,
                regulator_type_name: 1,
                date_n_time: 1,
                pending_count: 1,
                approved_count: 1,
                rejected_count: 1,
                disabled_count: 1,
                deleted_count: 1
            }
        }

    ]);
}

export const getRegulatoriesBodyList = async (search: any) => {
    let matchStage: any = {};
    const escapeRegex = (text = "") =>
        text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    if (search?.trim()) {
        const keyword = escapeRegex(search.trim());

        matchStage.regulatory_bodies_name = {
            $regex: keyword,
            $options: "i"
        };
    }


    return company_exchanges_bodiesM.aggregate([
        {
            $match: matchStage
        },
        {
            $lookup: {
                from: 'cln_static_countries',
                localField: 'country_id',
                foreignField: '_id',
                as: 'country_info'
            }
        },
        { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },

        {
            $lookup: {
                from: 'cln_company_regulatory_types',
                localField: 'regulatory_type_id',
                foreignField: '_id',
                as: 'type_info'
            }
        },
        { $unwind: { path: "$type_info", preserveNullAndEmptyArrays: true } },

        // Find companies that contain this regulatory body
        {
            $lookup: {
                from: "cln_company_lists",
                let: { reg_body_id: "$_id" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $in: [
                                    "$$reg_body_id",
                                    { $ifNull: ["$regularities_details.regulatory_bodies_ids", []] }
                                ]
                            }
                        }
                    }
                ],
                as: "companies"
            }
        },

        // Add counts
        {
            $addFields: {
                pending_count: {
                    $size: {
                        $filter: {
                            input: "$companies",
                            as: "c",
                            cond: {
                                $and: [
                                    { $eq: ["$$c.approval_status", 0] },
                                    { $eq: ["$$c.active_status", 1] }
                                ]
                            }

                        }
                    }
                },
                approved_count: {
                    $size: {
                        $filter: {
                            input: "$companies",
                            as: "c",
                            cond: {
                                $and: [
                                    { $eq: ["$$c.approval_status", 1] },
                                    { $eq: ["$$c.active_status", 1] }
                                ]
                            }

                        }
                    }
                },
                rejected_count: {
                    $size: {
                        $filter: {
                            input: "$companies",
                            as: "c",
                            cond: { $eq: ["$$c.approval_status", 2] }
                        }
                    }
                },
                disabled_count: {
                    $size: {
                        $filter: {
                            input: "$companies",
                            as: "c",
                            cond: { $eq: ["$$c.active_status", 0] }
                        }
                    }
                },
                deleted_count: {
                    $size: {
                        $filter: {
                            input: "$companies",
                            as: "c",
                            cond: { $eq: ["$$c.active_status", 2] }
                        }
                    }
                }
            }
        },
        {
            $project: {
                companies: 0
            }
        },

        {
            $project: {
                _id: 1,
                country_id: 1,
                regulatory_bodies_name: 1,
                regulatory_type_id: 1,
                date_n_time: 1,
                country_name: '$country_info.country_name',
                country_flag: '$country_info.country_flag',
                currency_code: '$country_info.currency_code',
                country_code: '$country_info.country_code',
                regulator_type_name: "$type_info.regulator_type_name",
                pending_count: 1,
                approved_count: 1,
                rejected_count: 1,
                disabled_count: 1,
                deleted_count: 1
            }
        }
    ]);
}

/**
 * Hardcoded lookup of a single specific company (row id 4520) — reads like
 * leftover debug/scaffolding code, and its actual function (a company's
 * regulatory-body detail) is fully subsumed by getRegulatoriesList above
 * (generic for any id). No confirmed frontend caller in either repo audited
 * during this engagement, but kept live in its natural home rather than a
 * separate "dead code" file — per the FINAL PHASE decision, this route's URL
 * may still be depended on by a consumer outside those two repos.
 */
export const getIds = async () => {
    const get_details = await companyM.findOne({ _id: 4520 },
        { company_name: 1, regularities_details: 1 })
        .populate({
            path: 'regularities_details.regulatory_bodies_ids',
            model: 'cln_exchange_bodies'
        })
    return { status: true, message: get_details }
}

/**
 * Single-body "what regulatory type is this" lookup. No confirmed frontend
 * caller — both frontends already receive regulatory_type_id/
 * regulator_type_name embedded directly on each row from
 * getRegulatoriesBodyList above and resolve the type client-side, never a
 * per-body round trip. Kept live in its natural home, same rationale as
 * getIds above.
 */
export const getBodyType = async (bodyIdParam: any) => {
    const bodyId = Number.parseInt(bodyIdParam);
    const bodyDoc = await company_exchanges_bodiesM.findOne({ _id: bodyId });

    if (!bodyDoc) {
        return { status: false, message: 'Body not found' };
    }

    const typeDoc = await company_regulatory_typesM.findOne({ _id: bodyDoc.regulatory_type_id });

    return {
        status: true,
        message: {
            regulatory_type_id: bodyDoc.regulatory_type_id,
            regulator_type_name: typeDoc?.regulator_type_name || ''
        }
    };
}

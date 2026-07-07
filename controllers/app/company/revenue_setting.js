const express = require('express')
const router = express.Router()

const { check, validationResult } = require('express-validator')
const { arrangeValidation } = require('../../../utils/helpers/helper')
const { checkUserLoginToken } = require('../../../middleware/authorization')
const companyM = require('../../../models/app/company/companyM')
const company_revenue_growthM  = require('../../../models/app/company/company_revenue_growthM')
const { deleteCompanyRevenue } = require('../../../config/app_helper')

router.get('/revenue_overview',  async(req, res) =>  
    {
        try
        {

            const checkUserToken = checkUserLoginToken(req.headers)
            if(checkUserToken.status)
            {
                const user_row_id = checkUserToken.message
                const companyQuery = await companyM.findOne({user_row_id:user_row_id, active_status:1})
                if(companyQuery)
                {
                    const company_row_id = parseInt(companyQuery._id)
                    const checkCompanyData = await company_revenue_growthM.aggregate([
                        { $match: { company_row_id: company_row_id } },
                        { $group: { _id: "$year", total_revenue: { $sum: "$revenue" } } },
                        { $sort: { _id: 1 } }
                    ]);
    
                    const total_revenue_query = await company_revenue_growthM.aggregate([
                        { $match: { company_row_id: company_row_id } },
                        { $group: { _id: null, total_revenue: { $sum: "$revenue" } } }
                    ]);
    
                    const total_revenue = total_revenue_query[0] ? total_revenue_query[0].total_revenue : 0
        
                    res.json({status:true, message:checkCompanyData, total:total_revenue })
                }
                else
                {
                    res.json({status:false, message:{alert_message:'Company not listed'}})
                }
            }
            else
            {
                res.json(checkUserToken)
            }
        }
        catch(err)
        {
            console.log('Revenue Overview.', err.message)
            res.json({ status:false, message: 'An unexpected error occurred. Please try again later.' })
        } 
    })

router.post('/save', [
    check('year')
    .trim().not().isEmpty().withMessage('The Year field is required.')
    .isInt().withMessage('The year field must be contains only integers.'),
    check('quarter')
    .trim().not().isEmpty().withMessage('The Quarter field is required.')
    .isInt().withMessage('The quarter field must be contains only integers.'),
    check('revenue')
    .trim().not().isEmpty().withMessage('The Reenue field is required.')
    .isInt().withMessage('The revenue field must be contains only integers.'),
], async(req, res) =>  {
    try
    {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        
        const checkUserToken = checkUserLoginToken(req.headers)
        if(checkUserToken.status)
        {
            const user_row_id = checkUserToken.message
            let company_row_id = 0
            let year = 0
            let quarter = 0
             
            const companyQuery = await companyM.findOne({user_row_id:user_row_id, active_status:1})
            if(!companyQuery)
            {
                errObj['company_row_id'] = 'Invalid Company Row Id'
            }
            else
            {
                company_row_id = parseInt(companyQuery._id)
               
                if(req.body.year && req.body.quarter)
                {
                    year = parseInt(req.body.year)
                    quarter = parseInt(req.body.quarter)
                    const check_existing_revenue = await company_revenue_growthM.findOne({company_row_id:company_row_id, year:year, quarter:quarter })
                    if(check_existing_revenue)
                    {
                        errObj['quarter'] = 'Sorry, This revenue details already exists.'
                    }
        
                    // Check yearly revenue already exists
                    if(quarter !== 5 )
                    {
                        const check_yearly_revenue = await company_revenue_growthM.findOne({company_row_id:company_row_id, year:year, quarter:5 })
                        if(check_yearly_revenue)
                        {
                            errObj['quarter'] = 'Sorry, A yearly record already exists for this year. You can add either quarterly or yearly data.'
                        }
                    }
        
                    // Check quarterly revenue already exists
                    if(quarter == 5)
                    {
                        const check_quartely_revenue = await company_revenue_growthM.findOne({company_row_id:company_row_id, year:year, quarter: { $ne: 5 } })
                        if(check_quartely_revenue)
                        {
                            errObj['quarter'] = 'Sorry, Quaterly records already exists for this year. You can add either quarterly or yearly data.'
                        }
                    }
                }
            }
        
            if(Object.keys(errObj).length > 0) 
            {
                res.json({status:false, message:errObj})
            }
            else
            { 
                const insertArray = {}
                insertArray['year'] = year
                insertArray['quarter'] = quarter
                insertArray['revenue'] = parseInt(req.body.revenue)
                insertArray['company_row_id'] = company_row_id
    
                await company_revenue_growthM(insertArray).save()
    
                res.json({status:true, message:{alert_message:"Your company's revenue details have been saved successfully. Thank you for keeping your financial information current!"}})
            }
        }
        else
        {
            res.json(checkUserToken)
        }
    }
    catch(err)
    {
        console.log('Save revenue details.', err.message)
        res.json({ status:false, message: 'An unexpected error occurred. Please try again later.' })
    } 
})
 

router.get('/list',  async(req, res) =>  
{
    try
    {
        const checkUserToken = checkUserLoginToken(req.headers)
        if(checkUserToken.status)
        {
            const user_row_id = checkUserToken.message
            const companyQuery = await companyM.findOne({user_row_id:user_row_id, active_status:1})
            if(companyQuery)
            {
                const company_row_id = parseInt(companyQuery._id)
                const checkCompanyData = await company_revenue_growthM.find({company_row_id:company_row_id}).sort({year:-1, quarter:1})
                const count = await company_revenue_growthM.countDocuments({company_row_id:company_row_id})
    
                res.json({status:true, message:checkCompanyData, count:count})
            }
            else
            {
                res.json({status:false, message:{alert_message:'Company not listed'}})
            }
        }
        else
        {
            res.json(checkUserToken)
        }

    }
    catch(err)
    {
        console.log('Revenue list.', err.message)
        res.json({ status:false, message: 'An unexpected error occurred. Please try again later.' })
    } 
})



router.get('/view/:id',  async(req, res) =>  
{
    try
    {
        const checkUserToken = checkUserLoginToken(req.headers)
        if(checkUserToken.status)
        {
            const user_row_id = checkUserToken.message
            const revenue_row_id = parseInt(req.params.id)
            if(!isNaN(revenue_row_id))
            {
                const companyQuery = await companyM.findOne({user_row_id:user_row_id, active_status:1})
                if(companyQuery)
                {
                    const company_row_id = parseInt(companyQuery._id)
                    const checkCompanyData = await company_revenue_growthM.findOne({_id:revenue_row_id, company_row_id:company_row_id})
                    if(checkCompanyData)
                    {
                        res.json({status:true, message:checkCompanyData})
                    }
                    else
                    {
                        res.json({status:false, message:{alert_message:'Sorry, Invalid Request Row ID'}})
                    }
                }
                else
                {
                    res.json({status:false, message:{alert_message:'Company not listed'}})
                }
            }
            else
            {
                res.json({status:false, message:{alert_message:'Sorry, Invalid Revenue row id'}})
            }
        }
        else
        {
            res.json(checkUserToken)
        }

    }
    catch(err)
    {
        console.log('Individual revenue view.', err.message)
        res.json({ status:false, message: 'An unexpected error occurred. Please try again later.' })
    } 
})


router.post('/update/:id', [
    check('year')
    .isInt().withMessage('The year field must be contains only integers.')
    .trim().not().isEmpty().withMessage('The Year field is required.'),
    check('quarter')
    .trim().not().isEmpty().withMessage('The Quarter field is required.')
    .isInt().withMessage('The quarter field must be contains only integers.'),
    check('revenue')
    .trim().not().isEmpty().withMessage('The Reenue field is required.')
    .isInt().withMessage('The revenue field must be contains only integers.'),
], async(req, res) =>  
{
    try
    {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        
        const checkUserToken = checkUserLoginToken(req.headers)
        if(checkUserToken.status)
        {
            const user_row_id = checkUserToken.message
            const revenue_row_id = parseInt(req.params.id)
            let company_row_id = 0
            let year = 0
            let quarter = 0
             
            const companyQuery = await companyM.findOne({user_row_id:user_row_id, active_status:1})
            if(!companyQuery)
            {
                errObj['company_row_id'] = 'Invalid Company Row Id'
            }
            else
            {
                company_row_id = parseInt(companyQuery._id)
               
                if(req.body.year && req.body.quarter)
                {
                    year = parseInt(req.body.year)
                    quarter = parseInt(req.body.quarter)
                    const check_existing_revenue = await company_revenue_growthM.findOne({_id:{ $ne:revenue_row_id}, company_row_id:company_row_id, year:year, quarter:quarter })
                    if(check_existing_revenue)
                    {
                        errObj['quarter'] = 'Sorry, This revenue details already exists.'
                    }
        
                    // Check yearly revenue already exists
                    if(quarter !== 5 )
                    {
                        const check_yearly_revenue = await company_revenue_growthM.findOne({_id:{ $ne:revenue_row_id}, company_row_id:company_row_id, year:year, quarter:5 })
                        if(check_yearly_revenue)
                        {
                            errObj['quarter'] = 'Sorry, A yearly record already exists for this year. You can add either quarterly or yearly data.'
                        }
                    }
        
                    // Check quarterly revenue already exists
                    if(quarter == 5)
                    {
                        const check_quartely_revenue = await company_revenue_growthM.findOne({_id:{ $ne:revenue_row_id}, company_row_id:company_row_id, year:year, quarter: { $ne: 5 } })
                        if(check_quartely_revenue)
                        {
                            errObj['quarter'] = 'Sorry, Quaterly records already exists for this year. You can add either quarterly or yearly data.'
                        }
                    }
                }
            }
        
            if(Object.keys(errObj).length > 0) 
            {
                res.json({status:false, message:errObj})
            }
            else
            { 
               
                if(!isNaN(revenue_row_id))
                {
                    const checkCompanyData = await company_revenue_growthM.findOne({_id:revenue_row_id, company_row_id:company_row_id})
                    if(checkCompanyData)
                    {
                        const updateArray = {}
                        updateArray['year'] = year
                        updateArray['quarter'] = quarter
                        updateArray['revenue'] = parseInt(req.body.revenue)
                        updateArray['company_row_id'] = company_row_id
                            
                        await company_revenue_growthM.updateOne({_id:revenue_row_id, company_row_id:company_row_id},{$set:updateArray})
                        
                        res.json({status:true, message:{alert_message:"Your company's revenue details have been updated successfully. Thank you for keeping your financial information current!"},updateArray:updateArray})
                    }
                    else
                    {
                        res.json({status:false, message:{alert_message:'Sorry, Invalid Request Row ID'}})
                    }
    
                }
                else
                {
                    res.json({status:false, message:{alert_message:'Sorry, Invalid Revenue row id'}})
                }
                
            }
        }
        else
        {
            res.json(checkUserToken)
        }

    }
    catch(err)
    {
        console.log('Update revenue details.', err.message)
        res.json({ status:false, message: 'An unexpected error occurred. Please try again later.' })
    } 
})



router.get('/delete/:id',  async(req, res) =>  
{
    try
    {
        const checkUserToken = checkUserLoginToken(req.headers)
        if(checkUserToken.status)
        {
            const user_row_id = checkUserToken.message
            const revenue_row_id = parseInt(req.params.id)
            if(!isNaN(revenue_row_id))
            {
                const companyQuery = await companyM.findOne({user_row_id:user_row_id, active_status:1})
                if(companyQuery)
                {
                    const company_row_id = parseInt(companyQuery._id)
                    const checkCompanyData = await company_revenue_growthM.findOne({_id:revenue_row_id, company_row_id:company_row_id})
                    if(checkCompanyData)
                    {
                        await deleteCompanyRevenue({type:1, revenue_row_id:revenue_row_id})

                        res.json({status:true, message:{alert_message:'The revenue details have been successfully deleted. Thank you for your action!'}})
                    }
                    else
                    {
                        res.json({status:false, message:{alert_message:'Sorry, Invalid Request Row ID'}})
                    }
                }
                else
                {
                    res.json({status:false, message:{alert_message:'Company not listed'}})
                }
                
            }
            else
            {
                res.json({status:false, message:{alert_message:'Sorry, Invalid Revenue row id'}})
            }
        }
        else
        {
            res.json(checkUserToken)
        }

    }
    catch(err)
    {
        console.log('Delete revenue details.', err.message)
        res.json({ status:false, message: 'An unexpected error occurred. Please try again later.' })
    } 
})



module.exports = router
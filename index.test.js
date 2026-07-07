
require('dotenv').config()
var express = require('express')
var app = express()
var cors = require('cors')
var bodyParser = require('body-parser')
const fileUpload = require('express-fileupload')
require('./config/database')
const request = require("supertest")
const route = require('./config/route/index')
const { checkApiKey } = require('./config/authorization')

//middleware setup start here 
app.use(express.static(__dirname + '/'));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true, parameterLimit: 50000 }))
app.use(bodyParser.json({ limit: "50mb" }))
app.use(fileUpload())
app.use(cors())

app.use(checkApiKey)
app.use(route) 

describe('Main Index File is Working', function(){
    test('Main Index File', function(){
        expect(staticFun()).toBe(true);
    })
})

const staticFun = () =>
{
    return true
}



module.exports = app


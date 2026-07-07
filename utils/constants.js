require('dotenv').config()

const getHeaders =  function () 
{   
    return {
      method: "POST",
      headers: {"Content-Type": "application/json", "X-API-KEY": process.env.GRAPHQL_API_KEY}
      }
}




module.exports = { getHeaders}
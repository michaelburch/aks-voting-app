var express = require('express');
var os = require("os");
var morgan  = require('morgan');
const { SecretClient } = require("@azure/keyvault-secrets");
const { DefaultAzureCredential } = require("@azure/identity");

// Configuration and potential overrides
var port = process.env.PORT || 8080;
var vote1 = process.env.VOTE1VALUE || "Cats";
var vote2 = process.env.VOTE2VALUE || "Dogs";
var mySQLHost = process.env.MYSQL_HOST || "voting-storage";
var mySQLUser = process.env.MYSQL_USER;
var mySQLPassword = process.env.MYSQL_PASSWORD;
var mySQLPort = process.env.MYSQL_PORT || 3306;
var mySQLDatabase = process.env.MYSQL_DATABASE;


async function main() {
  // Attempt to retrieve database password value from KeyVault
  if ("KEY_VAULT_NAME" in process.env) 
  {
    try {
      var credential = new DefaultAzureCredential();
      var keyVaultName = process.env["KEY_VAULT_NAME"];
      var url = "https://" + keyVaultName + ".vault.azure.net";
      const client = new SecretClient(url, credential);
      console.log('Configured to use KeyVault ' + url);
      var secretName = ("KEY_VAULT_SECRET" in process.env) ? process.env["KEY_VAULT_SECRET"] : "VOTE_SQL_PASS";
      var secret = await client.getSecret(secretName);
      console.log('Retrieved vault Secret ' + secretName);
      mySQLPassword = secret.value
    }
    catch (e)
    {
      console.log('Failed to access keyvault: ' + e )
    }
  }
  // Set up mySQL connection
  var mysql = require('mysql2');
  var config =
  {
    host                : mySQLHost,
    user                : mySQLUser,
    password            : mySQLPassword,
    database            : mySQLDatabase,
    port                : mySQLPort,
    waitForConnections  : true,
    connectionLimit     : 5,
    queueLimit          : 0
  };
  var pool = mysql.createPool(config);

  // Set up express
  var app = express();
  app.use(morgan('combined'));
  // GET - display vote form and analytics
  app.get('/analytics', function (req, res) {

    pool.query('select votevalue, count(votevalue) as count from azurevote where votevalue in (?,?) group by votevalue;', [vote1, vote2], function (error, results, fields) {
      if (error) throw error;
      
      var total = 0;
      var vote1count = 0;
      var vote2count = 0;
      
      for (var i in results) {
        if (results[i].votevalue === vote1) { vote1count = results[i].count }
        if (results[i].votevalue === vote2) { vote2count = results[i].count }
        total += results[i].count;
      }
      
      var vote1percentage = vote1count == 0 ? 0 : ((vote1count / total) * 100).toFixed(0);
      var vote2percentage = vote2count == 0 ? 0 : ((vote2count / total) * 100).toFixed(0);
      var text = vote1 + ': ' + vote1count + '/' + total + ' (' + vote1percentage + '%) | ' + vote2 + ': ' + vote2count + '/' + total + ' (' + vote2percentage + '%)';
      
      res.json({
        "category1": {
          "name": vote1,
          "count": vote1count
        },
        "category2": {
          "name": vote2,
          "count": vote2count
        },
        "text": text
      });
    });     
  });

  // Set up listener
  app.listen(port, function () {
    console.log("Listening on: http://%s:%s", os.hostname(), port);
  })

}
main();



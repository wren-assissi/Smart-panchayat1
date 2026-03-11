const { InfluxDB } = require('@influxdata/influxdb-client');
require('dotenv').config();

const client = new InfluxDB({
  url: process.env.INFLUX_URL || 'http://localhost:8086',
  token: process.env.INFLUX_TOKEN || '',
});

const queryApi = client.getQueryApi(process.env.INFLUX_ORG || 'my-org');

module.exports = { client, queryApi };

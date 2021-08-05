// CRUD create read update delete

const mongodb = require('mongodb')
var moment = require('moment');
const MongoClient = mongodb.MongoClient

const connectionURL = 'mongodb://127.0.0.1:27017'
const databaseName = 'niftyTrades'
//const collectionName = 'holdings';


//this function can be used to store all successfully performed trades for the day
function insertFinalTradeDetails(data, collectionName)
{
	MongoClient.connect(connectionURL, { useNewUrlParser: true }, (error, client) => {
		if (error) {
			return console.log('Unable to connect to database!')
		}
		
		const db = client.db(databaseName)
		if(collectionName=='all_holdings'){
			let remaing_tokens=[]
			data.forEach(function (record) {
				db.collection(collectionName).findOneAndReplace( { "instrument_token": record.instrument_token, "current_timestamp": record.current_timestamp },
																	record, {upsert: true}
																).then((result) => {
																	//console.log(result)
																}).catch((error) => {
																	console.log(error)
																})
			});
		}
	})
}


//this function can be used to settle the trades for the todays session
async function deleteTradesDetailsBeforeDate(data, collectionName) {
	let current_time=moment().format('MMMM Do YYYY, h:mm:ss a');
	let client = await MongoClient.connect(connectionURL);
	let dbo = client.db(databaseName);
    result = await dbo.collection(collectionName).deleteMany({ "current_timestamp": { $lt: current_time } });
    console.log(`${result.deletedCount} document(s) was/were deleted.`);
	if(collectionName == "positionsWindow" && data.length>0)
	{
		await syncInsertTradesDetails(data, collectionName);
		return data;
	}
	else{
		return [];
	}
}


//this function is used to called to fetch db details and send details as list back to the called function
async function syncFetchTradesDetails(collectionName) {
    let client = await MongoClient.connect(connectionURL);
    let dbo = client.db(databaseName);
	return await dbo.collection(collectionName).find({},{ _id: 0}).toArray()
}


//this function will be called to store data into db from list
async function syncInsertTradesDetails(data, collectionName)
{
	MongoClient.connect(connectionURL, { useNewUrlParser: true }, (error, client) => {
		if (error) {
			return console.log('Unable to connect to database!')
		}
		deleteTradesDetailsBeforeDate(data, collectionName);
		const db = client.db(databaseName)
		data.forEach(function (record) {
			db.collection(collectionName).findOneAndReplace( { "instrument_token": record.instrument_token, "current_timestamp": record.current_timestamp },
																	record, {upsert: true}
																).then((result) => {
																	//console.log(result)
																}).catch((error) => {
																	console.log(error)
																})
			});
	})
}

//insertOIDetails(oi_minute1, collectionName)
async function insertOIDetails(oi_minute1, collectionName)
{
	MongoClient.connect(connectionURL, { useNewUrlParser: true }, (error, client) => {
		if (error) {
			return console.log('Unable to connect to database!')
		}
	
		const db = client.db(databaseName)
		db.collection(collectionName).findOneAndReplace( { "current_timestamp": oi_minute1.current_timestamp },
																	oi_minute1, {upsert: true}
																).then((result) => {
																	//console.log(result)
																}).catch((error) => {
																	console.log(error)
																})
	})
}

async function fetchOIDetails(collectionName) {
    let client = await MongoClient.connect(connectionURL);
    let dbo = client.db(databaseName);
	return await dbo.collection(collectionName).find({"current_timestamp": moment(new Date(),'MMMM Do YYYY, h:mm:ss a')},{ _id: 0}).toArray()
}


async function fetchBalance(collectionName) {
    let client = await MongoClient.connect(connectionURL);
    let dbo = client.db(databaseName);
	return await dbo.collection(collectionName).find({"flag": true},{ _id: 0}).toArray()
}

async function updateBalance(current_balance, collectionName)
{
	MongoClient.connect(connectionURL, { useNewUrlParser: true }, (error, client) => {
		if (error) {
			return console.log('Unable to connect to database!')
		}
	
		const db = client.db(databaseName)
		db.collection(collectionName).findOneAndReplace( {"flag": true},
																{"balance": current_balance,
																"flag": true}, {upsert: true}
																).then((result) => {
																	//console.log(result)
																}).catch((error) => {
																	console.log(error)
																})
	})
}


module.exports = {
	insertFinalTradeDetails,
	deleteTradesDetailsBeforeDate,
	syncFetchTradesDetails,
	syncInsertTradesDetails,
	insertOIDetails,
	fetchOIDetails,
	fetchBalance,
	updateBalance
};

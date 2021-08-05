var KiteTicker = require("kiteconnect").KiteTicker;
var KiteConnect = require("kiteconnect").KiteConnect;
var moment = require('moment');
var Handlebars = require("handlebars");

const converter = require('./json_xls_converter.js');
const db_work = require('./db_work.js');

const path = require('path')
const http = require('http')
const express = require('express')
const socketio = require('socket.io')


const app = express()
const server = http.createServer(app)
const io = socketio(server)

const port = process.env.PORT || 3001
const publicDirectoryPath = path.join(__dirname, '../public')

app.use(express.static(publicDirectoryPath))

let count = 0


var api_key = "enter_your_api_key",
	secret = "enter_your_secret",
	request_token = "enter_your_request_token",
	access_token = "enter_your_access_token";

var ticker = new KiteTicker({
  	api_key: api_key,
  	access_token: access_token
 });
 
var options = {
	"api_key": api_key,
	"debug": false
};

var expirydate_based_instrument_types_numbers = {},
    formated_Title_For_EachEntry = {};

var nifty_instrumentsitems = [12212226, 12212482],
	expiryDates = [], 
	option_chain_data = [],
	option_chain = [],
	current_ticks = {},
	current_ticks_original =[];
	
let openprice=14900,
	current_balance=0,
	current_range = 300;

kc = new KiteConnect(options);
//kc.setSessionExpiryHook(sessionHook);

if(!access_token) {
	kc.generateSession(request_token, secret)
		.then(function(response) {
			console.log("Response", response);
			init();
		})
		.catch(function(err) {
			console.log(err);
		})
} else {
	kc.setAccessToken(access_token);
	init();
}

function init() {
	console.log(kc.getLoginURL());
	getInstruments(["NFO"], current_range);
}

function worker(NFO_Data, range){
	//NFO_Data contains all the options data in json format
	//fetch all instrument_types
	
	db_work.fetchBalance('updateBalance').then(results => {
		//console.log(results);
		current_balance=results[0]["balance"];
		//console.log(current_balance)
	});
	
	//get NIFTY options data only till now
	option_chain = getSpecificOptionDataOnly(NFO_Data, "NIFTY");
	
	//get OI data which has 400 strikeprice lower and higher than the open strikeprice
	option_chain_data = getRangedStrikePriceOIData(option_chain, range);
 
	//get unique exipry dates only
	expiryDates = getExpiryDates(option_chain_data);
	
	//coloection of instrument_types based upon expirydates
	var data = getExpirydate_Based_InstrumentTypes_List_And_formated_Title_For_EachEntry_updated(option_chain_data, expiryDates);
	//12212226     '10136066',
	expirydate_based_instrument_types_numbers = data.expirydate_based_instrument_types_numbers_updated_list;
	formated_Title_For_EachEntry = data.formated_Title_For_EachEntry;
	expiryDates = data.expirydate_updated;
	//getExpirydate_Based_InstrumentTypes_List_And_formated_Title_For_EachEntry_updated(option_chain_data, expiryDates);
	//get formated title for instrument_token
	
	
}

 
 // set autoreconnect with 10 maximum reconnections and 5 second interval
 

 io.on('connection', (socket) => {
    console.log('New WebSocket connection')
	//insertExipryDatesIntoDb(expiryDates);
	io.emit('initialization', expiryDates)
	io.emit('open_price', openprice);
	io.emit('current_balance', current_balance);
	
	ticker.autoReconnect(true, 30, 30)
	ticker.connect();
	ticker.on("ticks", onTicks);
	ticker.on("connect", subscribe);
 
	ticker.on("noreconnect", function() {
		console.log("noreconnect");
	});
 
	ticker.on("reconnect", function(reconnect_count, reconnect_interval) {
		console.log("Reconnecting: attempt - ", reconnect_count, " interval - ", reconnect_interval);
	});
 	
	 function onTicks(ticks) { 
		current_ticks_original = ticks;
		current_ticks={};
		current_ticks_original.forEach(function (record) {
			current_ticks[record.instrument_token]=record;
		});
		socket.emit('updateTables', {expirydate_based_instrument_tokens: expirydate_based_instrument_types_numbers, titles: formated_Title_For_EachEntry, ticks: current_ticks})
		//console.log("Ticks", ticks);
	}
 
	function subscribe() {
  		ticker.subscribe(nifty_instrumentsitems);
  		ticker.setMode(ticker.modeFull, nifty_instrumentsitems);
	}
	
	//underconstruction
	socket.on('expiryDateBasedInstrumentTypes', (expiryDate) => {
		//nifty_instrumentsitems =[]
		expirydate_based_instrument_types_numbers[expiryDate].forEach(function (record) {
				nifty_instrumentsitems.push(parseInt(record));	
		});
		subscribe();
	})
	
	socket.on('update_current_balance', ({current_balance, collectionName}) => {
		//console.log('haha1');
		if(current_balance>0){
			let ans = db_work.updateBalance(current_balance, collectionName);
			socket.emit('message', ans);
		}
		//console.log('file ban gai')
		
    })
	
	socket.emit('updateTables', {titles: formated_Title_For_EachEntry, ticks: current_ticks})
	
	/*
    socket.on('increment', () => {
        count++
        io.emit('countUpdated', count)
    })*/
	
	socket.on('createExcelFileAndSendFileOnMail', ({holdings, filename}) => {
		let ans = converter.createExcelFileAndSendFileOnMail(holdings, filename);
		if(ans==true)
			socket.emit('message', 'file has successfully created and sent to mail id.');
		else
			socket.emit('message', 'Data is not available in holdings window.');
		//console.log('file ban gai')
		
    })
	
	socket.on('insertDataIntoStorage', ({holdings, collectionName}) => {
		//console.log('haha1');
		let ans = db_work.insertFinalTradeDetails(holdings, collectionName);
		socket.emit('message', ans);
		//console.log('file ban gai')
		
    })
	
	socket.on('deleteTradesDetailsBeforeDate', ({holdings, collectionName}) => {
		var tradesDetails=[];
		db_work.deleteTradesDetailsBeforeDate(holdings, collectionName).then(results => {
			tradesDetails=results;
			socket.emit('storeTradesDetailsIntoList', {collection: collectionName, trades: results});
		});
    })

	socket.on('syncFetchTradesDetails', (collectionName) => {
		var tradesDetails=[];
		db_work.syncFetchTradesDetails(collectionName).then(results => {
			tradesDetails=results;
			socket.emit('storeTradesDetailsIntoList', {collection: collectionName, trades: tradesDetails});
		});
		
    })
	
	socket.on('syncInsertTradesDetails', ({holdings, collectionName}) => {
		db_work.syncInsertTradesDetails(holdings, collectionName);
    })
	
	//socket.emit('oi_1_minute', ({oi_minute1, collectionName}));
	socket.on('oi_1_minute', ({oi_minute1, collectionName}) => {
		db_work.insertOIDetails(oi_minute1, collectionName);
    })
	
	//socket.emit('fetchOIDetails', "oi_1_minute");
	socket.on('fetchOIDetails', (collectionName) => {
		var oiDetails=[];
		db_work.syncFetchTradesDetails(collectionName).then(results => {
			oiDetails=results;
			socket.emit('storeOIDetailsIntoList', oiDetails);
		});
		
    })
	
})

server.listen(port, () => {
    console.log(`Server is up on port ${port}!`)
}) 
 
 
  
 function getInstruments(exchange, range) {
	kc.getInstruments(exchange).then(function(response) {
		worker(response, range);
		
	}).catch(function(err) {
		console.log(err);
	})
}


function allInstrumentTypes(data) {
	
	
}

function getSpecificOptionDataOnly(NFO_Data, Requirement)
{
	//fetch only required options data like "NIFTY" or "BANKNIFTY"
	let option_data = NFO_Data.filter(record => {
        return (
            record.name==Requirement //&& !record.includes("BANKNIFTY") && !record.includes("FINNIFTY") 
        )
    });
	return option_data;
}

function getRangedStrikePriceOIData(option_chain, range)
{
	let option_chain_data = [];
	option_chain.forEach(function (record) {
		if(record.strike>=openprice-range && record.strike<=openprice+range)
			option_chain_data.push(record);	
	});
	return option_chain_data;
}


function getExpiryDates(option_chain_data)
{
	//fetch all expiry dates
	option_chain_data.forEach(function (record) {
		expiryDates.push(record.expiry);
	});
	
	//fetch unique dates only
	let expiryDates_unique = expiryDates.filter((date, i, self) => 
		self.findIndex(d => d.getTime() === date.getTime()) === i
	);
	
	//sort unique expirydates
	expiryDates_unique.sort(function(a,b){return a.getTime() - b.getTime()});
	
	//doing subarray for to remove unnecessary data and weekely expiry based upon wednesday and thursday
	if(moment().day()==3 || moment().day()==4)
		expiryDates_unique = expiryDates_unique.slice(1,6);
	else
		expiryDates_unique = expiryDates_unique.slice(0,5);
	
	return expiryDates_unique;
}


function getExpirydate_Based_InstrumentTypes_List_And_formated_Title_For_EachEntry(option_chain_data, expiryDates)
{
	let expirydate_based_instrument_types_numbers_inner = {},
		expirydate_based_instrument_types_numbers_updated = {},
		formated_Title_For_EachEntry = {},
		expirydate_updated = [];
	
	//sizing array upto the size of expirydates array size
	expiryDates.forEach(function (record) {
		expirydate_based_instrument_types_numbers_inner[record] = [];
	});
	
	//storing instrument_tokens based upon the expirydate 
	option_chain_data.forEach(function (record) {
		if(record.expiry in expirydate_based_instrument_types_numbers_inner){
			expirydate_based_instrument_types_numbers_inner[record.expiry].push(record.instrument_token);
			formated_Title_For_EachEntry[record.instrument_token] = record.name+" "+moment(record.expiry).format("Do MMM")+ " "+ record.strike + " " + record.instrument_type;
		}
	});
	 
	
	
	Object.keys(expirydate_based_instrument_types_numbers_inner).forEach(function(key) {
		expirydate_based_instrument_types_numbers_updated[moment(new Date(key)).format("Do MMM YYYY")]=expirydate_based_instrument_types_numbers_inner[key];
	})
	
	Object.keys(expirydate_based_instrument_types_numbers_updated).forEach(function(key) {
		expirydate_updated.push(key);
	})
	
	return {expirydate_based_instrument_types_numbers_updated, formated_Title_For_EachEntry, expirydate_updated};
}


function getExpirydate_Based_InstrumentTypes_List_And_formated_Title_For_EachEntry_updated(option_chain_data, expiryDates)
{
	let expirydate_based_instrument_types_numbers_inner_list = {},
		expirydate_based_instrument_types_numbers_updated_list = {},
		expirydate_based_instrument_types_numbers_inner_map = {},
		expirydate_based_instrument_types_numbers_updated_map = {},
		formated_Title_For_EachEntry = {},
		expirydate_updated = [];
	
	//sizing array upto the size of expirydates array size
	expiryDates.forEach(function (record) {
		expirydate_based_instrument_types_numbers_inner_list[record] = [];
		expirydate_based_instrument_types_numbers_inner_map[record]={};
	});
	
	//storing instrument_tokens based upon the expirydate 
	option_chain_data.forEach(function (record) {
		if(record.expiry in expirydate_based_instrument_types_numbers_inner_list){
			if(record.strike in expirydate_based_instrument_types_numbers_inner_map[record.expiry]){
				expirydate_based_instrument_types_numbers_inner_map[record.expiry][record.strike].push(record.instrument_token);
			}
			else
			{
				expirydate_based_instrument_types_numbers_inner_map[record.expiry][record.strike] = [record.instrument_token];
			}
			expirydate_based_instrument_types_numbers_inner_list[record.expiry].push(record.instrument_token);
			formated_Title_For_EachEntry[record.instrument_token] = record.name+" "+moment(record.expiry).format("Do MMM")+ " "+ record.strike + " " + record.instrument_type;
		}
	});
	 
	
	
	Object.keys(expirydate_based_instrument_types_numbers_inner_list).forEach(function(key) {
		expirydate_based_instrument_types_numbers_updated_list[moment(new Date(key)).format("Do MMM YYYY")]=expirydate_based_instrument_types_numbers_inner_list[key];
		expirydate_based_instrument_types_numbers_updated_map[moment(new Date(key)).format("Do MMM YYYY")]=expirydate_based_instrument_types_numbers_inner_map[key];
	})
	
	Object.keys(expirydate_based_instrument_types_numbers_updated_list).forEach(function(key) {
		expirydate_updated.push(key);
	})
	//console.log(expirydate_based_instrument_types_numbers_updated_map);
	return {expirydate_based_instrument_types_numbers_updated_list, formated_Title_For_EachEntry, expirydate_updated};
	//console.log(expirydate_based_instrument_types_numbers_updated_list);
	//console.log(expirydate_based_instrument_types_numbers_updated_map);
}


function getHistoricalData(instrument_token, interval, from_date, to_date, continuous) {
	kc.getHistoricalData(instrument_token, interval, from_date, to_date, continuous)
		.then(function(response) {
			console.log(response);
		}).catch(function(err) {
			console.log(err);
		});
}





module.exports = {
   expirydate_based_instrument_types_numbers,
   formated_Title_For_EachEntry,
   nifty_instrumentsitems,
   expiryDates,
   current_ticks
}
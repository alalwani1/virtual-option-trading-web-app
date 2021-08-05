const socket = io()
//https://kite.zerodha.com/connect/login?api_key=nsdbfx360xpj5mbh&v=3

var current_titles=[],
	current_ticks = {},
	current_instrument_tokens = [],
	current_require_instrument_tokens = [],
	current_buy_orders = [],
	current_close_orders = [],
	current_order = [],
	all_orders=[],
	minute_oi_data=[],
	last_time_stamp='',
	current_time_stamp='',
	workbook,
	openPrice=0, 
	openPricen=0,
	openPricenn=0;
	//10477
var current_available_balance=12254.5;
	
var expiryDate='';


// this function can be used to create all order tables in their respective windows
function tableFromJson(data_list, loc) {
		// the json data. (you can change the values for output.)
        var myBooks = data_list;

        // Extract value from table header. 
        // ('Book ID', 'Book Name', 'Category' and 'Price')
        var col = [];
        for (var i = 0; i < myBooks.length; i++) {
            for (var key in myBooks[i]) {
                if (col.indexOf(key) === -1) {
					if(key!="instrument_token" && key!="change" && key!="quantity" && key!="current_timestamp" &&key!="_id")
						col.push(key);
                }
            }
        }

        // Create a table.
        var table = document.createElement("table");

        // Create table header row using the extracted headers above.
        var tr = table.insertRow(-1);                   // table row.

        for (var i = 0; i < col.length; i++) {
            var th = document.createElement("th");      // table header.
            th.innerHTML = col[i];
            tr.appendChild(th);
        }

        // add json data to the table as rows.
        for (var i = 0; i < myBooks.length; i++) {

            tr = table.insertRow(-1);

            for (var j = 0; j < col.length; j++) {
                var tabCell = tr.insertCell(-1);
                tabCell.innerHTML = myBooks[i][col[j]];
            }
        }

        // Now, add the newly created table with json data, to a container.
        var divShowData = document.getElementById(loc);
        divShowData.innerHTML = "";
        divShowData.appendChild(table);
}

//this function can be used to update the LTP in all order windows entries
function updateLTP(order_list, loc)
{
	if(order_list.length>0){
		let key='';
		let ndata=[]
		order_list.forEach(function (record) {
			key = record["instrument_token"].toString();
			ndata = (current_ticks[key]);
			if(record["instrument_token"]==ndata["instrument_token"])
			{
				record["LTP"]=ndata["last_price"];
			}
		});
		tableFromJson(order_list, loc);
		socket.emit('syncInsertTradesDetails', {holdings: order_list, collectionName: loc});
	}	
}

//this function can be used to updated balance label
function updateBalance(){
	let balance_label=document.getElementById("balance").innerHTML.split(" ");
	document.getElementById("balance").innerHTML = balance_label[0]+' '+current_available_balance;
	socket.emit('update_current_balance', {current_balance: current_available_balance, collectionName: 'updateBalance'});
}

//this function is used to check if the currently buying entry is already present in the current_buy_order_list of not if present then add in that entry
function checkandAddInExistingPositionOrders(data)
{
	let flag=true;
	for (var i = 0; i < current_buy_orders.length; i++) {
		if(current_buy_orders[i]["instrument_token"]==data["instrument_token"])
		{
			//console.log('true hai')
			current_buy_orders[i]["buy_price"]=(current_buy_orders[i]["buy_price"]*current_buy_orders[i]["buy_quantity"]+data["buy_price"]*data["buy_quantity"])/(current_buy_orders[i]["buy_quantity"]+data["buy_quantity"])
			current_buy_orders[i]["quantity"]=current_buy_orders[i]["buy_quantity"]+data["buy_quantity"];
			current_buy_orders[i]["buy_quantity"]=current_buy_orders[i]["buy_quantity"]+data["buy_quantity"];
			current_buy_orders[i]["amount_invested"]=current_buy_orders[i]["amount_invested"]+data["amount_invested"];
			return false;
		}
		//console.log('true hai');
	}
	return true;
}

function checkandAddInExistingHoldingsWindow(data)
{
	let flag=true;
	for (var i = 0; i < current_close_orders.length; i++) {
		if(current_close_orders[i]["instrument_token"]==data["instrument_token"])
		{
			current_close_orders[i]["quantity"]=current_close_orders[i]["quantity"]-data["buy_quantity"];
			current_close_orders[i]["sell_quantity"]=current_close_orders[i]["sell_quantity"]+data["sell_quantity"];
			current_close_orders[i]["amount_invested"]=0;
			current_close_orders[i]["day_PnL"]=current_close_orders[i]["day_PnL"]+data["day_PnL"];
			current_close_orders[i]["sell_price"] = (current_close_orders[i]["sell_price"]*current_close_orders[i]["sell_quantity"]+data["sell_price"]*data["sell_quantity"])/(current_close_orders[i]["sell_quantity"]+data["sell_quantity"]);			
			return false;
		}
	}
	return true;
}

function validationOrderFormForBuyOrder(data){
	let amount_required = data.last_price*data.quantity;
	let d;
	//add buy order entry
	if(amount_required +40 <= current_available_balance)
	{
		current_available_balance = current_available_balance - (amount_required);
		data["buy_price"]=data.last_price;
		data["buy_quantity"]=data.quantity;
		data["sell_price"]=0
		data["sell_quantity"]=0;
		data["amount_invested"]=data.quantity*data.last_price;
		data["status"]="completed";
		d=Object.assign({}, data);
		all_orders.push(d);
		return true;
	}
	//order reject entry
	else if((data.last_price*data.lot_size + 40 <= current_available_balance) && data.quantity>data.lot_size)
	{
		//current_order =[];
		data["buy_price"]=data.last_price;
		data["buy_quantity"]=data.quantity;
		data["sell_price"]=0
		data["sell_quantity"]=0;
		data["amount_invested"]=data.quantity*data.last_price;
		data["status"]="Asked high quantity but have sufficient funds to purchase less quantity!!";
		d=Object.assign({}, data);
		all_orders.push(d);
		return null;
	}
	//insufficient fund entry
	else
	{
		data["buy_price"]=data.last_price;
		data["buy_quantity"]=data.quantity;
		data["sell_price"]=0
		data["sell_quantity"]=0;
		data["amount_invested"]=data.quantity*data.last_price;
		data["status"]="insufficient funds!!";
		d=Object.assign({}, data);
		all_orders.push(d);
		return false;
	}
}

function validationOrderFormForSellOrder(data) {
	required_instrument_token = data["instrument_token"];
	let buy_order= current_buy_orders.filter(record => {
        return (
            record["instrument_token"]==required_instrument_token 
        )
    });
	//buy order exist
	if(Array.isArray(buy_order) && buy_order.length)
	{
		let order=buy_order[0];
		//console.log(current_buy_orders);
		//console.log(data);
		//console.log(order);
		//add sell order entry
		if(data["quantity"]<order["quantity"])
		{
			data["day_PnL"]=parseFloat((parseFloat(data["last_price"])-parseFloat(order["last_price"]))*(parseInt(order["quantity"])-parseInt(data["quantity"]))).toFixed(4);
			remaining_quantity = order["quantity"]-data["quantity"];
			console.log('hi1'+required_instrument_token);
			console.log(remaining_quantity);
			console.log(typeof(data["instrument_token"]))
			console.log(typeof(required_instrument_token))
			current_buy_orders.forEach(function (record) {
				if(record["instrument_token"]==required_instrument_token){
					record["quantity"]=remaining_quantity;
					record["buy_quantity"]=remaining_quantity;
					record["amount_invested"]=remaining_quantity*record["last_price"];	
				}
			});
			current_available_balance = current_available_balance + (data["quantity"]*data["last_price"])
			data["buy_price"]=order["last_price"];
			data["sell_price"]=data["last_price"];
			data["buy_quantity"]=data["quantity"];
			data["sell_quantity"]=data["quantity"];
			let d=Object.assign({}, data);
			let ans=checkandAddInExistingHoldingsWindow(d)
			if(ans==true)
				current_close_orders.push(d);
					
			data["status"]="completed";
			d=Object.assign({}, data);
			all_orders.push(d);
			console.log(current_buy_orders);
			updateOrderWindowData();
			//console.log(current_close_orders);
			//console.log(buy_order);
			//console.log(order);
			//console.log('chutiyaa kata1')
			return true;
		}
		//add sell order entry
		else if(data["quantity"]==order["quantity"])
		{
			data["day_PnL"]=parseFloat((parseFloat(data["last_price"])-parseFloat(order["last_price"]))*(parseInt(data["quantity"]))).toFixed(2);
			console.log('yaha hai gapla');
			current_buy_orders = current_buy_orders.filter(record => {
				return (
				record["instrument_token"]!=data["instrument_token"]
				)
			});
			console.log(current_buy_orders);
			data["buy_price"]=order["last_price"];
			data["sell_price"]=data["last_price"];
			data["buy_quantity"]=order["quantity"];
			data["sell_quantity"]=data["quantity"];
			current_available_balance = current_available_balance + (data["quantity"]*data["last_price"])
			let d=Object.assign({}, data);
			let ans=checkandAddInExistingHoldingsWindow(d)
			if(ans==true)
				current_close_orders.push(d);
			//current_close_orders.push(data);
			data["status"]="completed";
			d=Object.assign({}, data);
			all_orders.push(d);
			updateOrderWindowData();
			//console.log(current_close_orders);
			//console.log('chutiyaa kata2')
			return true;
		}
		//Your sell order quantity is more than the quantity you have
		else
		{
			//console.log('Chutiya kata3');
			//current_order =[];
			data["buy_price"]=order["last_price"];
			data["sell_price"]=data["last_price"];
			data["buy_quantity"]=order["quantity"];
			data["sell_quantity"]=data["quantity"];
			data["status"]="sell order quantity is more than the buy quantity";
			let d=Object.assign({}, data);
			all_orders.push(d);
			return null;
		}
	}
	//not supporting shortning entry
	else
	{
		data["buy_price"]=0;
		data["sell_price"]=data["last_price"];
		data["buy_quantity"]=0;
		data["sell_quantity"]=data["quantity"];
		data["status"]="options shortning not supporting currently";
		let d=Object.assign({}, data);
		all_orders.push(d);
		return false;
	}		
}

function selectedExpiryDate(){
	//console.log('change');
	expiryDate = document.querySelector('#expiryDate').value;
	console.log(expiryDate);
	socket.emit('expiryDateBasedInstrumentTypes', expiryDate);
}


buyFunc = function(obj){
    console.log('Buy');
	let data={}
	data = JSON.parse(obj);
	data["order_type"]="Buy";
	//console.log(data);
	data["buy_timings"]= moment().format('MMMM Do YYYY, h:mm:ss a');
	data["current_timestamp"] = moment(new Date(),'MMMM Do YYYY, h:mm:ss a');
	data["LTP"]=0;
	data["day_PnL"]=0;
	current_order.push(data);
	document.getElementById("instrument_title").innerHTML = data.instrument_title;
	document.getElementById("quantity_title").innerHTML = "Buy Quantity";
	openForm(data);
}

sellFunc = function(obj){
    console.log('Sell');
	let data={}
	data = JSON.parse(obj);
	data["order_type"]="Sell";
	data["sell_timings"]= moment().format('MMMM Do YYYY, h:mm:ss a');
	data["current_timestamp"] = moment(new Date(),'MMMM Do YYYY, h:mm:ss a');
	data["LTP"]=0;
	data["day_PnL"]=0;
	//console.log(data);
	current_order.push(data);
	document.getElementById("instrument_title").innerHTML = data.instrument_title;
	document.getElementById("quantity_title").innerHTML = "Sell Quantity";
	openForm(data);
}


function openForm(data) {
  document.getElementById("myForm").style.display = "block";
}

function closeForm() {
  current_order=[];
  document.getElementById("quantity").value=75;
  document.getElementById("myForm").style.display = "none";
}

function placeOrder()
{
	let order = current_order[0];
	order["quantity"]=parseInt(document.getElementById("quantity").value);
	//console.log(document.getElementById("quantity").value);
	//console.log(order);
	//console.log('hahaha');
	//add validation 
	if(order["order_type"]=="Buy")
	{
		let ans1=validationOrderFormForBuyOrder(order)
		if(ans1==true)
		{
			alert("Successfully Buy order placed");
			order["day_PnL"]=0;
			//if true then it already added second bought quantity in the already existing postion table or in current_buy_orders
			let ans2 = checkandAddInExistingPositionOrders(order);
			//console.log('mai zinda hu');
			//console.log(ans2);
			if(ans2==true){
				let d=Object.assign({}, order);
				//console.log('mai phir b tumko chahunga');
				current_buy_orders.push(order);
			}
			current_available_balance = current_available_balance - 20;
			updateBalance();
			//console.log(current_available_balance);
			updateOrderWindowData();
			closeForm();
		}
		else if(ans1==false)
		{
			alert("Insufficient funds available.");
			closeForm();
		}
		else if(ans1==null){
			current_order=[]
			current_order.push(order);
			alert("Asked quantity is more than the balance you have!!");
			//closeForm();
		}
	}
	else if(order["order_type"]=="Sell"){
		//add validation for selling
		let ans = validationOrderFormForSellOrder(order)
		if(ans==true)
		{
			alert("Sell order placed successfully");
			current_available_balance = current_available_balance - 20;
			updateBalance();
			console.log(current_available_balance);
			console.log(current_buy_orders);
			
			tableFromJson(current_buy_orders, 'positionsWindow');
			
			//updateOrderWindowData();
			closeForm();
		}
		else if(ans==false)
		{
			alert("We are not supporting options shorting currently. Sorry for inconenience caused to you!!!");
			closeForm();
		}
		else if(ans==null){
			tableFromJson(all_orders, 'ordersWindow');
			alert("Your sell order quantity is more than the quantity you have")
		}
	}
	updateOrderWindowData();
	
	
}

Handlebars.registerHelper('getThis', function() {
    return JSON.stringify(this);
});

/*
document.querySelector('#increment').addEventListener('click', () => {
    console.log('Clicked')
    socket.emit('increment')
})*/


socket.on('currentOIFeed', (current_ticks) => {
	current_ticks = current_ticks;
	console.log(current_ticks);
})

socket.on('storeTradesDetailsIntoList', ({collection, trades}) => {
	if(collection=="ordersWindow")
		all_orders = trades;
	else if(collection=="positionsWindow")
		current_buy_orders = trades;
	else if(collection=="holdingsWindow")
		current_close_orders = trades;
	//console.log(collection);
	//console.log(trades);
	tableFromJson(trades, collection);
})

socket.on('storeOIDetailsIntoList', (oiDetails) => {
	minute_oi_data = oiDetails;
	//console.log(minute_oi_data);
})


socket.on('current_balance', (current_balance) => {
	current_available_balance = current_balance;
	updateBalance();
	console.log(current_available_balance);
})

socket.on('open_price', (openprice) => {
	openPrice = openprice;
	openPricen = openprice + 50;
	openPricenn = openprice + 100; 
	console.log(openPrice);
})

socket.on('initialization', (expiryDates) => {
	let expirySelect = document.querySelector('#expiryDate');
      expirySelect.innerHTML = expiryDates.map((c, idx) => {
        return `<option value="${c}">${c}</option>`;
      });
	last_time_stamp =  moment(new Date(), 'MMMM Do YYYY, h:mm:ss a')
    console.log('The expiryDates has been updated!', expiryDates)
	socket.emit('syncFetchTradesDetails', "ordersWindow");
	socket.emit('syncFetchTradesDetails', "positionsWindow");
	socket.emit('syncFetchTradesDetails', "holdingsWindow");
	socket.emit('fetchOIDetails', "oi_1_minute");
})

socket.on('message', (message) => {
	console.log(message);
})


//i have send instruments_types for 1st table of intial artitechtechture for OI data
socket.on('updateTables', ({expirydate_based_instrument_tokens, titles, ticks}) => {
	current_titles = titles;
	current_ticks = ticks;
	current_instrument_tokens = expirydate_based_instrument_tokens;
	document.querySelector('#expiryDate').value = expiryDate;
	if(current_instrument_tokens!=undefined && expiryDate!=''){
		generateTable();
	}
})


function generateTable(){
	
	let lastUpdated;
	document.querySelector('#expiryDate').value = expiryDate;
	var datas = [], real_data=[], oi_data=[]
	current_require_instrument_tokens = current_instrument_tokens[expiryDate]
	current_require_instrument_tokens.forEach(function (record) {
		let data = {
		"instrument_title": current_titles[record.toString()],
		"change": '',
		"last_price": 0,
		"oi":0,
		"strike":0
		}
		datas[parseInt(record)]=data;
	});
	Object.keys(current_ticks).forEach(function(key) {
		if(key in datas)
		{
			datas[key].change=current_ticks[key].change;
			datas[key].last_price=current_ticks[key].last_price;
			datas[key].oi = current_ticks[key].oi;
			datas[key].strike = parseInt(datas[key].instrument_title.split(" ")[3]);
		}
		lastUpdated = moment(current_ticks[key].timestamp).format('MMMM Do YYYY, h:mm:ss a');
	});	
	Object.keys(datas).forEach(function(key) {
		let data = {
		"instrument_token": parseInt(key),
		"instrument_title": datas[key].instrument_title,
		"change": parseFloat(datas[key].change).toFixed(2)+'%',
		"last_price": datas[key].last_price,
		"oi": datas[key].oi,
		"strike": datas[key].strike,
		"lot_size":75
		}
		real_data.push(data);
	});
	
	
	
	document.querySelector('#lastUpdated').innerHTML = 'Last Updated: ' + lastUpdated;
	real_data.sort(function (a, b) {
		return a.instrument_title.localeCompare(b.instrument_title);
	});
	
	//console.log(real_data)
	for (var i = 0; i < real_data.length; i++) {
		
        let data = {
			"ce_oi": real_data[i].oi,
			"strike": real_data[i].strike,
			"pe_oi": real_data[i+1].oi,
			"current_time_stamp":  moment().format('MMMM Do YYYY, h:mm:ss a')
		}
		i++;
		oi_data.push(data);
    }
	
	
	current_time_stamp = moment(new Date(), 'MMMM Do YYYY, h:mm:ss a');
	let ms = moment.duration(current_time_stamp.diff(last_time_stamp, 'seconds'));//moment(current_time_stamp).format('MMMM Do YYYY, h:mm:ss a').diff(moment(last_time_stamp).format('MMMM Do YYYY, h:mm:ss a'));
	//let d = moment.duration(ms);
	if(ms>60)
	{
		last_time_stamp = current_time_stamp;
		let data = {
			"ce_oi": 0,
			"pe_oi": 0,
			"current_timestamp":  moment().format('h:mm:ss a'),
			"today_date": moment().format('MMMM Do YYYY')
		}
		for (var i = 0; i < oi_data.length; i++) {
			if((oi_data[i].strike==openPrice || oi_data[i].strike==openPricen || oi_data[i].strike==openPricenn) && oi_data[i].ce_oi>0)
			{
				console.log(oi_data[i].strike);
				data["ce_oi"] = data["ce_oi"] + oi_data[i].ce_oi;
				data["pe_oi"] = data["pe_oi"] + oi_data[i].pe_oi;
			}
		}
		
		data["ce_oi"] = data["ce_oi"].toLocaleString('en-IN');
		data["pe_oi"] = data["pe_oi"].toLocaleString('en-IN');
		minute_oi_data.push(data);
		let showData=[]
		if(minute_oi_data.length>20)
			showData = minute_oi_data.slice(minute_oi_data.length - 15, minute_oi_data.length);
		else
			showData = minute_oi_data; 
		var context1 = {objects: showData}
		
		var source1 = document.getElementById("chain3").innerHTML;
		var template1 = Handlebars.compile(source1);
		document.getElementsByClassName('table3')[0].innerHTML = template1(context1);	
		socket.emit('oi_1_minute', {oi_minute1: data, collectionName: 'oi_1_minute'});
	}
	
	//console.log(oi_data);
	
	var context = {objects: real_data}
	var source = document.getElementById("chain1").innerHTML;
    var template = Handlebars.compile(source);
	document.getElementsByClassName('table1')[0].innerHTML = template(context);	
	
	context = {objects: oi_data};
	source = document.getElementById("chain2").innerHTML;
    template = Handlebars.compile(source);
	document.getElementsByClassName('table2')[0].innerHTML = template(context);	
	//update LTP
	updateOrderWindowData();
		
}

//update LTP in orderWindowData
function updateOrderWindowData()
{	
	updateLTP(all_orders, 'ordersWindow');
	updateLTP(current_buy_orders, 'positionsWindow');
	updateLTP(current_close_orders, 'holdingsWindow');
}

function manageTradeDetailsForToday()
{
	socket.emit('update_current_balance', {current_balance: current_available_balance, collectionName: 'updateBalance'});
	socket.emit('deleteTradesDetailsBeforeDate', {holdings: all_orders, collectionName: 'ordersWindow'});
	socket.emit('deleteTradesDetailsBeforeDate', {holdings: current_buy_orders, collectionName: 'positionsWindow'});
	socket.emit('deleteTradesDetailsBeforeDate', {holdings: current_close_orders, collectionName: 'holdingsWindow'});
}

function createExcelAndSendDataOnEmailId()
{
	socket.emit('update_current_balance', {current_balance: current_available_balance, collectionName: 'updateBalance'});
	socket.emit('createExcelFileAndSendFileOnMail', {holdings: current_close_orders, filename: 'holdings'});
	socket.emit('insertDataIntoStorage', {holdings: current_close_orders, collectionName: 'all_holdings'});
	//createExcelFile(current_close_orders, 'holdings');
}


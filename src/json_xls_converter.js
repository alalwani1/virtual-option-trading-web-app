var excel = require('excel4node');
var moment = require('moment');
const path = require('path')
const fs = require('fs'); 
const maileSender= require('./mail_sender.js');


// Create a new instance of a Workbook class
var workbook = new excel.Workbook();
const ws = workbook.addWorksheet('holdings');

const generatedFilePath = path.join(__dirname, '../public/generated_excel_files')
var folder_name ='';


   
function createFolder(){
	folder_name = moment().format('MMMM_Do_YYYY');
	fs.mkdir(path.join(generatedFilePath, folder_name), (err) => { 
    	if (err) {
        	return console.error(err); 
    	} 
    	console.log('Directory created successfully!'); 
	});
}

function fetchColumnNames(data)
{
	var columnNames=[];
	if (data.length > 0)
	{ 
		columnsIn = data[0]; 
		for(let key in columnsIn){
			//if(key!="instrument_token" && key!="oi" && key!="strike" && key!="change" && && key!="_id"){
				//console.log(key);
				columnNames.push(key);
			//}
			//console.log(key); // here is your column name you are looking for
		} 
	}
	else
	{
		console.log("Data is not available in holdings window.");
	}
	//console.log(columnNames);
	return columnNames;
}


function createExcelFileAndSendFileOnMail(data, filename) {
	
	let headingColumnNames = fetchColumnNames(data);
	if(headingColumnNames.length>0){
	
		let day_PnL=0, columnNumber, rowNumber;
	
		//Write Column Title in Excel file
		let headingColumnIndex = 1;
		headingColumnNames.forEach(heading => {
			ws.cell(1, headingColumnIndex++)
				.string(heading)
		});

		//Write Data in Excel file
		let rowIndex = 2;
		data.forEach( record => {
			let columnIndex = 1;
			Object.keys(record ).forEach(columnName =>{
				if(columnName=="day_PnL"){
					rowNumber = rowIndex
					columnNumber = columnIndex
					day_PnL = day_PnL + parseFloat(record [columnName]);
				
				}
				ws.cell(rowIndex,columnIndex++)
					.string((record [columnName]).toString())
			});
			rowIndex++;
		}); 
		ws.cell(rowNumber+2,columnNumber-1).string(("Day P&L "))
		ws.cell(rowNumber+2,columnNumber).string((day_PnL).toString())
		createFolder();
		let file_path=path.join(generatedFilePath, folder_name)+'/'+filename+'_'+moment().format('h_mm_ss_a')+'.xlsx';
		console.log(file_path);
		workbook.write(file_path);
		
		//send file on mail
		var attachments = [{ path: file_path}];
        maileSender.mailer("provide-sender-email-id", "receiver-email-id", "Todays Trades Details", attachments);
		return true;
	}
	else
	{
		return false;
	}
}

module.exports = {
	fetchColumnNames,
	createExcelFileAndSendFileOnMail
};

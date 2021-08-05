var path = require('path');
var nodemailer = require('nodemailer');

var smtpTransport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: "give-sender-email-id",
        pass: "give-password"
    },
	 tls : { rejectUnauthorized: false }
});

function mailer(from, to, subject, attachments, body) {
	var flag=false;
    // Setup email
    var mailOptions = {
        from: from,
        to: to,
        subject: subject,
        attachments: attachments,
    };

    // send mail with defined transport object
    smtpTransport.sendMail(mailOptions, function(error, response){
        if(error){ 
			console.Error('File unfortunately not sent to mailid.');
		}
        else{ 
			console.log('file successfully sent to mailid.');
		}
        // shut down the connection pool, no more messages
        smtpTransport.close();
    });
}

//console.log(generatedFilePath);

module.exports = {
	mailer
};

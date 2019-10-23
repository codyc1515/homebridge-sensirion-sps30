var fs = require('fs');
var readline = require('readline');

var pm25 = 0;

var Service, Characteristic;

module.exports = function(homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.hap.Accessory;

	homebridge.registerAccessory("homebridge-sensirion-sps30", "SensirionSPS30", SensirionAQS);
};

function SensirionAQS(log, config) {
	this.log = log;
	this.debug = config["debug"] || false;
}

SensirionAQS.prototype = {

	identify: function(callback) {
		this.log("identify");
		callback();
	},

	getServices: function() {
		this.AQS = new Service.AirQualitySensor(this.name);

		this.AQS
			.getCharacteristic(Characteristic.AirQuality)
			.on('get', this._getValue.bind(this, "AirQuality"));
		this.AQS.addCharacteristic(Characteristic.PM2_5Density);
		this.AQS.addCharacteristic(Characteristic.PM10Density);

		var informationService = new Service.AccessoryInformation();
		informationService
			.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, "Sensirion")
			.setCharacteristic(Characteristic.Model, "SPS30")
			.setCharacteristic(Characteristic.FirmwareRevision, "1.0.0")
			.setCharacteristic(Characteristic.SerialNumber, this.device);

		setInterval(function(){
			if(fs.existsSync('/tmp/sensor-sps30.txt')) {
				if(this.debug) {this.log("running timer");}

				var count = 0;
				var rl = readline.createInterface({input: fs.createReadStream('/tmp/sensor-sps30.txt')});
				rl.on('line', function(line) {
					if(line.split(' ')[0] === 'particulate_matter_ugpm3{size="pm2.5",sensor="SPS30"}') {
						if(this.debug) {this.log("setting pm2.5 to " + line.split(' ')[1]);}

						pm25 = line.split(' ')[1];

						this.AQS.getCharacteristic(Characteristic.PM2_5Density).updateValue(line.split(' ')[1]);

						if(pm25 <= 15) {this.AQS.getCharacteristic(Characteristic.AirQuality).updateValue(1);}
						else if(pm25 <= 40) {this.AQS.getCharacteristic(Characteristic.AirQuality).updateValue(2);}
						else if(pm25 <= 65) {this.AQS.getCharacteristic(Characteristic.AirQuality).updateValue(3);}
						else if(pm25 <= 150) {this.AQS.getCharacteristic(Characteristic.AirQuality).updateValue(4);}
						else {this.AQS.getCharacteristic(Characteristic.AirQuality).updateValue(5);}
					}
					if(line.split(' ')[0] === 'particulate_matter_ugpm3{size="pm10",sensor="SPS30"}') {
						if(this.debug) {this.log("setting pm10 to " + line.split(' ')[1]);}

						this.AQS.getCharacteristic(Characteristic.PM10Density).updateValue(line.split(' ')[1]);
					}
				}.bind(this));
			}
			else if(this.debug) {this.log("Unable to find log file from sensor");}
		}.bind(this), 1000);

		return [
			informationService,
			this.AQS
		];
	},

	_getValue: function(CharacteristicName, callback) {
		if (this.debug) {this.log("GET", CharacteristicName);}

		callback(null);
	}

};

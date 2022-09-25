const	inherits = require("util").inherits;
		fs = require('fs'),
		readline = require('readline'),
		moment = require('moment');

var pm25 = 0;

var Service, Characteristic, Accessory, FakeGatoHistoryService;

module.exports = function(homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.hap.Accessory;

	FakeGatoHistoryService = require('fakegato-history')(homebridge);

	homebridge.registerAccessory("homebridge-sensirion-sps30", "SensirionSPS30", SensirionAQS);
};

function SensirionAQS(log, config) {
	this.log = log;
	this.debug = config["debug"] || false;

	this.SmokeSensorTrigger = config["SmokeSensorTrigger"] || 150;

	// Air Quality (PPM) - FakeGato
	Characteristic.CustomAirQuality = function() {
		Characteristic.call(this, 'ppm', 'E863F10B-079E-48FF-8F27-9C2605A29F52');
		this.setProps({
			format: Characteristic.Formats.UINT16,
			unit: 'ppm',
			minValue: 0,
			maxValue: 5000,
			minStep: 1,
			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
		});
		this.value = this.getDefaultValue();
	};
	inherits(Characteristic.CustomAirQuality, Characteristic);
	Characteristic.CustomAirQuality.UUID = 'E863F10B-079E-48FF-8F27-9C2605A29F52';
}

SensirionAQS.prototype = {

	identify: function(callback) {
		this.log("identify");
		callback();
	},

	getServices: function() {
		// Air Quality Sensor service
		this.AirQualitySensor = new Service.AirQualitySensor(this.name);
		this.AirQualitySensor
			.getCharacteristic(Characteristic.AirQuality)
			.on('get', this._getValue.bind(this, "AirQuality"));
		this.AirQualitySensor.addCharacteristic(Characteristic.PM2_5Density);
		this.AirQualitySensor.addCharacteristic(Characteristic.PM10Density);

		// Smoke Sensor service
		this.SmokeSensor = new Service.SmokeSensor(this.name);

		// FakeGato service
		this.FakeGatoHistoryService = new FakeGatoHistoryService("room", Accessory);
		this.AirQualitySensor.addCharacteristic(Characteristic.CustomAirQuality);
		this.AirQualitySensor.addCharacteristic(Characteristic.CurrentTemperature);
		this.AirQualitySensor.addCharacteristic(Characteristic.CurrentRelativeHumidity);

		// Information service
		this.AccessoryInformation = new Service.AccessoryInformation();
		this.AccessoryInformation
			.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, "Sensirion")
			.setCharacteristic(Characteristic.Model, "SPS30")
			.setCharacteristic(Characteristic.FirmwareRevision, "1.0.0")
			.setCharacteristic(Characteristic.SerialNumber, this.device);

		// Set the timer
		setInterval(function(){
			if(fs.existsSync('/tmp/sps30.log')) {
				if(this.debug) {this.log("running timer");}

				var count = 0;
				var rl = readline.createInterface({input: fs.createReadStream('/tmp/sps30.log')});
				rl.on('line', function(line) {
					if(line.split(' ')[0] === 'particulate_matter_ugpm3{size="pm2.5",sensor="SPS30"}') {
						// Get the PM 2.5 value
						pm25 = line.split(' ')[1];
						if(this.debug) {this.log("PM 2.5", pm25);}

						// Set the PM 2.5 Density value
						this.AirQualitySensor.getCharacteristic(Characteristic.PM2_5Density).updateValue(pm25);

						// Set the PPM (PM 2.5) value in FakeGato
						this.AirQualitySensor.getCharacteristic(Characteristic.CustomAirQuality).updateValue(pm25);
						this.FakeGatoHistoryService.addEntry({time: Math.round(new Date().valueOf() / 1000), temp: '0', humidity: '0', ppm: pm25 });

						// Set the Air Quality value
						if(pm25 <= 15) {this.AirQualitySensor.getCharacteristic(Characteristic.AirQuality).updateValue(Characteristic.AirQuality.EXCELLENT);}
						else if(pm25 <= 40) {this.AirQualitySensor.getCharacteristic(Characteristic.AirQuality).updateValue(Characteristic.AirQuality.GOOD);}
						else if(pm25 <= 65) {this.AirQualitySensor.getCharacteristic(Characteristic.AirQuality).updateValue(Characteristic.AirQuality.FAIR);}
						else if(pm25 <= 150) {this.AirQualitySensor.getCharacteristic(Characteristic.AirQuality).updateValue(Characteristic.AirQuality.INFERIOR);}
						else {this.AirQualitySensor.getCharacteristic(Characteristic.AirQuality).updateValue(Characteristic.AirQuality.POOR);}

						if(pm25 >= this.SmokeSensorTrigger) {this.SmokeSensor.getCharacteristic(Characteristic.SmokeDetected).updateValue(Characteristic.SmokeDetected.SMOKE_DETECTED);}
						else {this.SmokeSensor.getCharacteristic(Characteristic.SmokeDetected).updateValue(Characteristic.SmokeDetected.SMOKE_NOT_DETECTED);}
					}
					if(line.split(' ')[0] === 'particulate_matter_ugpm3{size="pm10",sensor="SPS30"}') {
						if(this.debug) {this.log("PM 10", + line.split(' ')[1]);}

						// Set the PM 10 Density value
						this.AirQualitySensor.getCharacteristic(Characteristic.PM10Density).updateValue(line.split(' ')[1]);
					}
				}.bind(this));
			}
			else if(this.debug) {this.log("Unable to find log file from the sensor");}
		}.bind(this), 1000);

		return [
			this.AirQualitySensor,
			this.SmokeSensor,
			this.FakeGatoHistoryService,
			this.AccessoryInformation
		];
	},

	_getValue: function(CharacteristicName, callback) {
		if (this.debug) {this.log("GET", CharacteristicName);}

		callback(null);
	}

};

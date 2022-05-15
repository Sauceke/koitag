var BufferReader = require("buffer-reader");
const chroma = require("chroma-js");
const Color = require("colorficial");
const msgpackr = require("msgpackr");

function skipPng(reader) {
	reader.seek(8);
	let chunkSize;
	do {
		chunkSize = reader.nextUInt32BE();
		reader.move(4 + chunkSize + 4);
	}
	while(chunkSize != 0);
}

function readString(reader) {
	let length = reader.nextUInt8();
	return reader.nextString(length);
}

function getCardData(buffer) {
	const reader = new BufferReader(buffer);
	skipPng(reader);
	let productNo = reader.nextInt32LE();
	if (productNo > 100) {
		throw "Unexpected product number";
	}
	let cardType = readString(reader);
	let validCardTypes = ["【KoiKatuChara】", "【KoiKatuCharaS】", "【KoiKatuCharaSP】"];
	if (!validCardTypes.includes(cardType)) {
		throw `Unexpected card type "${cardType}"`;
	}
	readString(reader); // version
	let idPhotoSize = reader.nextInt32LE();
	reader.move(idPhotoSize);
	let blockHeaderSize = reader.nextInt32LE();
	let blockHeader = msgpackr.unpack(reader.nextBuffer(blockHeaderSize));
	reader.move(8);
	let customInfo = blockHeader.lstInfo.filter(block => block.name == "Custom")[0];
	let homePos = reader.tell();
	reader.seek(homePos + customInfo.pos);
	let faceLength = reader.nextInt32LE();
	let face = msgpackr.unpack(reader.nextBuffer(faceLength));
	let bodyLength = reader.nextInt32LE();
	let body = msgpackr.unpack(reader.nextBuffer(bodyLength));
	let hairLength = reader.nextInt32LE();
	let hair = msgpackr.unpack(reader.nextBuffer(hairLength));
	let paramInfo = blockHeader.lstInfo.filter(block => block.name == "Parameter")[0];
	reader.seek(homePos + paramInfo.pos);
	let soul = msgpackr.unpack(reader.nextBuffer(paramInfo.size));
	return {face: face, body: body, hair: hair, soul: soul};
}

const convertKkColor = rgb => chroma(rgb.slice(0, 3).map(ch => ch * 255));

function getColorName(rgb) {
	let color = convertKkColor(rgb).darken(1);
	if (color.luminance() < 0.01) {
		return "black";
	}
	let colorName = new Color(color.hex()).name();
	if (colorName == "gray") {
		// "mistaking" a color for gray seems to be about the only failure mode for colorficial
		// this is great because we know when not to add the tag
		return false;
	}
	return colorName?.replace?.("violet", "purple");
}

const getHairColorName = rgb => getColorName(rgb)?.replace?.("yellow", "blonde");

const rules = {
	// personality
	male: data => data.soul.sex === 0,
	female: data => data.soul.sex == 1,
	low_voice: data => data.soul.voiceRate < 0.1,
	high_voice: data => data.soul.voiceRate > 0.8,
	// skin
	tanline: data => data.body.sunburnId > 0,
	freckles: data => [1, 2, 3, 1769].includes(data.face.moleId),
	// hair
	COLOR_hair: function(data) {
		let colors = new Set(data.hair.parts.map(part => getHairColorName(part.baseColor)));
		if (colors.size != 1) {
			return false;
		}
		return [...colors][0];
	},
	sidelocks: data => data.hair.parts[2]?.id,
	ahoge: data => data.hair.parts[3]?.id,
	// eyes
	COLOR_eyes: function(data) {
		let color = getColorName(data.face.pupil[0].baseColor);
		let subColor = getColorName(data.face.pupil[0].subColor);
		return (color == subColor) && !rules.heterochromia(data) && color;
	},
	heterochromia: data =>
		getColorName(data.face.pupil[0].baseColor) != getColorName(data.face.pupil[1].baseColor) ||
			getColorName(data.face.pupil[0].subColor) != getColorName(data.face.pupil[1].subColor),
	// ears
	pointy_ears: data => data.face.shapeValueFace[50] > 0.5,
	// mouth
	COLOR_lips: data => data.face.baseMakeup.lipId != 0 && data.face.baseMakeup.lipColor[3] > 0.7
		&& getColorName(data.face.baseMakeup.lipColor),
	fangs: data => data.face.doubleTooth,
	sharp_teeth: data => data.face.headId == 61,
	// boing boing
	small_breasts: data => data.body.shapeValueBody[4] < 0.3,
	large_breasts: data => data.body.shapeValueBody[4] > 0.7,
	huge_breasts: data => data.body.shapeValueBody[4] > 1,
	// ( ͡° ͜ʖ ͡°)
	COLOR_pubic_hair: data =>
		data.body.underhairId != 0 && getHairColorName(data.body.underhairColor),
	// other
	short: data => data.body.shapeValueBody[0] < 0.1,
	tall: data => data.body.shapeValueBody[0] > 0.8,
	loli: data => rules.female(data) && rules.short(data) && rules.small_breasts(data) &&
		rules.high_voice(data),
	shota: data => rules.male(data) && rules.short(data)
}

function* enumerateTags(data) {
	for (let tag of Object.keys(rules)) {
		let result = rules[tag](data);
		if (result) {
			yield tag.replace("COLOR", result);
		}
	}
}

const getTags = buffer => [...enumerateTags(getCardData(Buffer.from(buffer)))]
		// filter out tags that don't sound right
		.filter(tag => !["brown_lips"].includes(tag))
		.sort();

exports.getTags = getTags;

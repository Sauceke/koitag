if (!window.koitag) {
	document.write('<script src="https://github.com/Sauceke/koitag/releases/latest/' + 
		'download/koitag.min.js"></script>');
}

async function onDrop(event) {
	event.preventDefault();
	let cardFile;
	for (item of event.dataTransfer.items) {
		if (item.kind == "file") {
			cardFile = item.getAsFile();
			break;
		} else if (item.kind == "string") {
			let str = await new Promise(resolve => item.getAsString(s => resolve(s)));
			if (str.match(/^https?\:\/\/.*\.png$/g)) {
				cardFile = await fetch(str).then(res => res.blob());
				break;
			}
		}
	}
	let buf = await cardFile.arrayBuffer();
	displayTags(koitag.getTags(buf));
	card.src = URL.createObjectURL(cardFile);
}

function onDragOver(ev) {
	ev.preventDefault();
}

function displayTags(tags) {
	let container = document.getElementById("tags");
	container.innerHTML = "";
	for (let tag of tags) {
		container.innerHTML += `<span class="tag">${tag}</span> `;
	}
}

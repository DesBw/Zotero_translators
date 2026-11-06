{
	"translatorID": "307b5947-ffba-4417-887f-8acf7b87fe4e",
	"label": "Library Genesis (libgen.li)",
	"creator": "DesBw",
	"target": "^https?://(www\\.)?libgen\\.(li|la|gl|bz|vg|me|xyz|vc)/",
	"minVersion": "5.0",
	"maxVersion": "",
	"priority": 50,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsibv",
	"lastUpdated": "2026-11-06 06:35:26"
}

/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2026 DesBw

	This file is part of Zotero.

	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with Zotero. If not, see <http://www.gnu.org/licenses/>.

	***** END LICENSE BLOCK *****
*/


// LibGen's "editions" table stores a record type for every entry. These are
// the values of that column, mapped to the labels LibGen itself shows on
// edition.php, and then to Zotero item types.
const EDITION_TYPES = {
	a: 'journalArticle', // journal article
	ant: 'book', // anthology
	b: 'book',
	bpart: 'bookSection', // book part
	bs: 'book', // book series
	bsect: 'bookSection',
	bset: 'book', // book set
	btrack: 'bookSection',
	c: 'book', // comics issue
	ch: 'bookSection', // book chapter
	chb: 'book', // chapbook
	col: 'book', // collection
	component: 'bookSection',
	dataset: 'dataset',
	diss: 'thesis', // dissertation
	fnz: 'magazineArticle', // fanzine
	j: 'book', // journal
	ji: 'book', // journal issue
	jv: 'book', // journal volume
	m: 'magazineArticle', // magazine issue
	mon: 'book', // monograph
	nonfict: 'book',
	nov: 'book', // novel
	oth: 'document',
	'peer-review': 'journalArticle',
	'posted-content': 'preprint',
	proc: 'book', // proceedings
	proca: 'conferencePaper', // proceedings article
	ref: 'book', // reference book
	refent: 'encyclopediaArticle', // reference entry
	rep: 'report',
	repser: 'report', // report series
	s: 'standard'
};

// Item types that only exist in recent Zotero versions.
const TYPE_FALLBACKS = {
	dataset: 'document',
	preprint: 'manuscript',
	standard: 'document'
};

const MONTHS = {
	jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
	jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

const SEASONS = { spr: 'Spring', sum: 'Summer', aut: 'Autumn', fal: 'Fall', win: 'Winter' };

const CREATOR_ROLES = {
	author: 'author',
	writer: 'author',
	editor: 'editor',
	compiler: 'editor',
	redactor: 'editor',
	translator: 'translator'
};

// Keys of LibGen's "additional description fields" table that carry
// bibliographic data we want. Used when the API omits the field names.
const ADD_KEYS = {
	20: 'Container Title',
	101: 'Language',
	401: 'Author',
	501: 'ISSN',
	505: 'ISBN',
	996: 'Description'
};

// Labels LibGen prints in front of every value on edition.php, file.php and
// ads.php. Also used to know where one value ends and the next begins.
const PAGE_LABELS = [
	'Series',
	'Title',
	'Author(s)',
	'Publisher',
	'Year',
	'Pages',
	'ISBN',
	'ISSN',
	'DOI owner',
	'DOI',
	'Topic',
	'Language',
	'Tags',
	'Edition ID',
	'Added',
	'Modified',
	'Filesize',
	'Size',
	'Extension',
	'File name',
	'Pages (in file)',
	'MD5',
	'OCR',
	'Library',
	'File ID',
	'Libgen Repository ID'
];

const LANGUAGES = {
	ara: 'Arabic', chi: 'Chinese', zho: 'Chinese', dut: 'Dutch', nla: 'Dutch',
	eng: 'English', fre: 'French', fra: 'French', ger: 'German', deu: 'German',
	hin: 'Hindi', ita: 'Italian', jap: 'Japanese', kor: 'Korean', pol: 'Polish',
	por: 'Portuguese', rus: 'Russian', spa: 'Spanish', swe: 'Swedish',
	tur: 'Turkish', ukr: 'Ukrainian'
};

const EDITION_ID_RE = /\/edition\.php\?[^#]*\bid=(\d+)/i;
const FILE_ID_RE = /\/file\.php\?[^#]*\bid=(\d+)/i;
const MD5_RE = /[?&]md5=([0-9a-f]{32})/i;


function detectWeb(doc, url) {
	if (EDITION_ID_RE.test(url)) {
		// The real record type only comes from the JSON endpoint, which
		// detectWeb() can't await, so guess from what the page shows and let
		// scrape() correct it.
		let text = doc.body ? doc.body.textContent : '';
		if (/ISBN\s*:/.test(text)) return 'book';
		if (/DOI\s*:/.test(text)) return 'journalArticle';
		return 'book';
	}
	if (FILE_ID_RE.test(url) || MD5_RE.test(url)) {
		return 'book';
	}
	if (getSearchResults(doc, true)) {
		return 'multiple';
	}
	return false;
}

function getSearchResults(doc, checkOnly) {
	let items = {};
	let found = false;
	let seen = new Set();
	for (let row of doc.querySelectorAll('tr')) {
		let link = pickTitleLink(row);
		if (!link || seen.has(link.key)) continue;
		if (checkOnly) return true;
		seen.add(link.key);
		found = true;
		items[link.href] = link.title;
	}
	return found ? items : false;
}

// One result row links to the same record several times: the issue line, the
// title, and the ISBN or DOI all point at the same edition.php URL. Prefer the
// link whose text reads like a title, and prefer edition links over file and
// download-page links. The page's bulk "JSON" link, which lists every ID the
// query matched, is deliberately ignored.
function pickTitleLink(row) {
	let best = null;
	for (let link of row.querySelectorAll('a[href]')) {
		let record = recordFromURL(link.href);
		if (!record) continue;
		let title = ZU.trimInternal(link.textContent);
		if (!title) continue;
		let rank = record.rank + (looksLikeTitle(title) ? 0 : 100);
		// Among equally good candidates prefer the longer text: a real title
		// outranks the short issue line that precedes it in the row.
		if (!best || rank < best.rank || (rank === best.rank && title.length > best.title.length)) {
			best = { href: link.href, key: record.key, title, rank };
		}
	}
	return best;
}

function recordFromURL(url) {
	if (!url) return null;
	let edition = url.match(EDITION_ID_RE);
	if (edition) return { key: 'e:' + edition[1], rank: 0 };
	let file = url.match(FILE_ID_RE);
	if (file) return { key: 'f:' + file[1], rank: 1 };
	let md5 = url.match(/\/ads\.php\?/i) && url.match(MD5_RE);
	if (md5) return { key: 'm:' + md5[1].toLowerCase(), rank: 2 };
	return null;
}

function looksLikeTitle(text) {
	if (text.length < 3) return false;
	if (/^(DOI|ISSN|ISBN|md5)\s*[:=]/i.test(text)) return false;
	// "0262035618; 9780262035613"
	if (!/[^\d\s.,;:\-–—()Xx]/.test(text)) return false;
	// "2024-jul 14 vol. 12 iss. 3 pp.18-45" and "2016 eng"
	if (/^(1[5-9]|20)\d{2}\s*([-–/]|\s|$)/.test(text)) return false;
	if (/\b(vol|iss|pp|no)\.?\s*\d/i.test(text)) return false;
	return true;
}

async function doWeb(doc, url) {
	if (detectWeb(doc, url) == 'multiple') {
		let items = await Zotero.selectItems(getSearchResults(doc, false));
		if (!items) return;
		for (let url of Object.keys(items)) {
			await scrape(await requestDocument(url));
		}
	}
	else {
		await scrape(doc, url);
	}
}

async function scrape(doc, url = doc.location.href) {
	let editionID = idFromURL(url, EDITION_ID_RE);
	let fileID = idFromURL(url, FILE_ID_RE);
	let md5 = idFromURL(url, MD5_RE);
	let recordDoc = doc;

	// file.php and ads.php identify a file rather than a record, so resolve
	// the file to the edition it belongs to first.
	if (!editionID) {
		editionID = await resolveEditionID(doc, fileID, md5);
		if (editionID) {
			// A file page carries almost no bibliographic metadata, so read the
			// record page it points at instead.
			recordDoc = await fetchDocument(originOf(url) + '/edition.php?id=' + editionID) || doc;
		}
	}

	let record = editionID ? await fetchEdition(editionID) : null;
	let meta = record ? recordToMetadata(record) : emptyMetadata();
	// The page fills in whatever the JSON endpoint left out - or everything,
	// when the endpoint is unavailable, which happens often enough to matter.
	mergePageMetadata(meta, recordDoc);
	if (!meta.title) return;

	// Prefer the hash of the file the user was actually looking at.
	if (!md5) md5 = md5FromPage(doc);
	if (!md5 && recordDoc !== doc) md5 = md5FromPage(recordDoc);
	let item = buildItem(meta, url, editionID, md5);
	item.complete();
}

function originOf(url) {
	return (url.match(/^https?:\/\/[^/]+/i) || [''])[0];
}

async function fetchDocument(url) {
	if (!url) return null;
	try {
		return await requestDocument(url);
	}
	catch (err) {
		Zotero.debug('Library Genesis: ' + url + ' failed: ' + err);
		return null;
	}
}

function idFromURL(url, re) {
	let match = (url || '').match(re);
	return match ? match[1] : '';
}

async function resolveEditionID(doc, fileID, md5) {
	// file.php lists the editions a file belongs to right on the page.
	for (let link of doc.querySelectorAll('a[href*="edition.php"]')) {
		let id = idFromURL(link.href, EDITION_ID_RE);
		if (id) return id;
	}
	if (fileID) {
		let edition = firstEditionID(await fetchJSON('/json.php?object=f&ids=' + fileID));
		if (edition) return edition;
	}
	if (md5) {
		let edition = firstEditionID(await fetchJSON('/json.php?object=f&md5=' + md5));
		if (edition) return edition;
	}
	return '';
}

function firstEditionID(data) {
	for (let file of Object.values(data || {})) {
		for (let edition of Object.values(file.editions || {})) {
			if (edition.e_id) return String(edition.e_id);
		}
	}
	return '';
}

// LibGen's JSON endpoint is rate limited and intermittently answers with an
// HTML error page ("User 'libgen_read' has exceeded the 'max_user_connections'
// resource"), so every call is best effort. Requests stay same-origin.
async function fetchJSON(url) {
	try {
		return await requestJSON(url);
	}
	catch (err) {
		Zotero.debug('Library Genesis: ' + url + ' failed: ' + err);
		return null;
	}
}

async function fetchEdition(editionID) {
	let data = await fetchJSON('/json.php?object=e&ids=' + editionID + '&addkeys=*');
	let record = (data || {})[editionID];
	return record && record.title ? record : null;
}

function emptyMetadata() {
	return {
		type: 'book',
		title: '',
		creators: [],
		date: '',
		publisher: '',
		place: '',
		edition: '',
		series: '',
		containerTitle: '',
		volume: '',
		issue: '',
		pages: '',
		numPages: '',
		DOI: '',
		ISBN: '',
		ISSN: '',
		language: '',
		abstractNote: ''
	};
}

function recordToMetadata(record) {
	let meta = emptyMetadata();
	meta.type = itemTypeFor(record.type);
	meta.title = buildTitle(record.title, record.title_add);
	meta.creators = parseCreators(record.author);
	meta.date = buildDate(record.year, record.month, record.day);
	meta.publisher = ZU.trimInternal(record.publisher || '');
	meta.place = ZU.trimInternal(record.city || '');
	meta.edition = ZU.trimInternal(record.edition || '');
	meta.series = ZU.trimInternal(record.series_name || '');
	meta.volume = ZU.trimInternal(record.issue_volume || '');
	meta.issue = ZU.trimInternal(record.issue_number || '');
	meta.pages = pageRange(record.issue_first_page, record.issue_last_page);
	meta.numPages = ZU.trimInternal(record.pages || '');
	meta.DOI = ZU.cleanDOI(record.doi || '') || '';

	let isbns = [];
	for (let row of Object.values(record.add || {})) {
		let name = (row.name_en || ADD_KEYS[row.key] || '').toLowerCase();
		let value = ZU.trimInternal(String(row.value || ''));
		if (!value) continue;
		switch (name) {
			case 'isbn':
				isbns.push(value);
				break;
			case 'issn':
				if (!meta.ISSN) meta.ISSN = ZU.cleanISSN(value) || value;
				break;
			case 'language':
				if (!meta.language) meta.language = languageName(value);
				break;
			case 'container title':
				if (!meta.containerTitle) meta.containerTitle = value;
				break;
			case 'description':
				// LibGen mixes publisher blurbs and stray markup fragments into
				// this field; only keep values that are plain text.
				if (!meta.abstractNote && !/[<>]/.test(value) && value.length > 40) {
					meta.abstractNote = value;
				}
				break;
			default:
				break;
		}
	}
	meta.ISBN = chooseISBN(isbns);
	return meta;
}

function itemTypeFor(type) {
	let itemType = EDITION_TYPES[(type || '').toLowerCase()];
	if (!itemType) return 'book';
	if (ZU.itemTypeExists(itemType)) return itemType;
	return TYPE_FALLBACKS[itemType] || 'book';
}

function buildTitle(title, titleAdd) {
	title = ZU.trimInternal(title || '');
	titleAdd = ZU.trimInternal(titleAdd || '');
	if (titleAdd && !title.toLowerCase().includes(titleAdd.toLowerCase())) {
		return title + ': ' + titleAdd;
	}
	return title;
}

function buildDate(year, month, day) {
	year = ZU.trimInternal(String(year || ''));
	if (!/^\d{4}$/.test(year)) return year;
	let code = String(month || '').toLowerCase();
	if (SEASONS[code]) return SEASONS[code] + ' ' + year;
	if (!MONTHS[code]) return year;
	let date = year + '-' + MONTHS[code];
	if (/^\d{1,2}$/.test(String(day || ''))) {
		date += '-' + ZU.lpad(String(day), '0', 2);
	}
	return date;
}

function pageRange(firstPage, lastPage) {
	firstPage = ZU.trimInternal(String(firstPage || ''));
	lastPage = ZU.trimInternal(String(lastPage || ''));
	if (firstPage && lastPage && firstPage !== lastPage) {
		return firstPage + '-' + lastPage;
	}
	return firstPage || lastPage;
}

function languageName(code) {
	return LANGUAGES[code.toLowerCase()] || code;
}

function chooseISBN(values) {
	let valid = [];
	for (let value of values) {
		let isbn = ZU.cleanISBN(value);
		if (isbn) valid.push(isbn);
	}
	return valid.find(isbn => isbn.length === 13) || valid[0] || '';
}

// LibGen keeps every creator in one free-text field and mixes several
// conventions in it:
//   "Ian Goodfellow, Yoshua Bengio, Aaron Courville"
//   "Bengio, Yoshua; Courville, Aaron; Goodfellow, Ian J"
//   "Goodfellow, Ian & Bengio, Yoshua"
//   "Houshmand, Negin (author);Esmaeili, Kamran (author)"
// Affiliations land in the same field and arrive as entries with an empty
// name, e.g. ", Department of Computer Science, ... (author)".
function parseCreators(authorString) {
	let creators = [];
	let seen = new Set();
	for (let entry of splitCreators(authorString)) {
		let role = 'author';
		let name = entry.replace(/\(([^()]*)\)\s*$/, (match, captured) => {
			role = CREATOR_ROLES[captured.trim().toLowerCase()] || role;
			return '';
		});
		name = ZU.trimInternal(name).replace(/^[,;\s]+|[,;\s]+$/g, '');
		if (!isCreatorName(name)) continue;
		let creator = ZU.cleanAuthor(name, 'author', name.includes(','));
		creator.creatorType = role;
		let key = (creator.lastName || '') + '|' + (creator.firstName || '') + '|' + (creator.name || '');
		if (seen.has(key)) continue;
		seen.add(key);
		creators.push(creator);
	}
	return creators;
}

function splitCreators(value) {
	value = ZU.trimInternal(value || '');
	if (!value) return [];
	if (value.includes(';')) return value.split(';');
	if (value.includes('&')) return value.split('&');
	if (/\s+and\s+/i.test(value)) return value.split(/\s+and\s+/i);
	if (!value.includes(',')) return [value];

	let parts = value.split(',').map(part => part.trim());
	// "Goodfellow, Ian" is one name in "Last, First" form, while
	// "Ian Goodfellow, Yoshua Bengio" is two names in "First Last" form.
	if (parts.length === 2) {
		return parts[0].includes(' ') && parts[1].includes(' ') ? parts : [value];
	}
	// "Orwell, George, Fromm, Erich" and "Smith, John A., Doe, Jane B." are
	// lists of "Last, First" pairs. The surnames are the single-token parts at
	// even positions; the given names may carry middle initials. A "First Last"
	// list fails this test because its even positions contain a space.
	if (parts.length % 2 === 0
		&& parts.every((part, index) => index % 2 || !part.includes(' '))) {
		let pairs = [];
		for (let i = 0; i < parts.length; i += 2) {
			pairs.push(parts[i] + ', ' + parts[i + 1]);
		}
		return pairs;
	}
	return parts;
}

function isCreatorName(name) {
	if (!name || name.length > 120 || /\d/.test(name)) return false;
	let words = name.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
	if (!words.length || words.length > 6) return false;
	return !/\b(department|university|universit|institute|faculty|school of|college|laboratory|centre|center|academy|hospital|foundation)\b/i.test(name);
}

function mergePageMetadata(meta, doc) {
	if (!meta.title) meta.title = pageField(doc, 'Title');
	if (!meta.creators.length) meta.creators = parseCreators(pageField(doc, 'Author(s)'));
	if (!meta.publisher) meta.publisher = pageField(doc, 'Publisher');
	if (!meta.date) meta.date = pageField(doc, 'Year');
	if (!meta.ISBN) meta.ISBN = chooseISBN(pageField(doc, 'ISBN').split(/[;,]/));
	if (!meta.ISSN) meta.ISSN = ZU.cleanISSN(pageField(doc, 'ISSN')) || '';
	if (!meta.DOI) meta.DOI = ZU.cleanDOI(pageField(doc, 'DOI')) || '';
	if (!meta.language) meta.language = pageField(doc, 'Language');
	if (!meta.numPages && !meta.pages) {
		let pages = normalizePageRange(pageField(doc, 'Pages'));
		if (pages.includes('-')) {
			meta.pages = pages;
		}
		else {
			meta.numPages = pages;
		}
	}
	// The container - journal, series or parent book - is a link on the page,
	// and LibGen's JSON endpoint only reports it for records that store it as
	// an additional field.
	let series = pageField(doc, 'Series').replace(/\s+vol\.\s*\d+\s+iss\.\s*\d+.*$/i, '');
	if (!meta.containerTitle) {
		let link = doc.querySelector('a[href*="series.php"]');
		meta.containerTitle = (link && ZU.trimInternal(link.textContent)) || series;
	}
	if (!meta.series) meta.series = series;
	if (!meta.type || meta.type === 'book') {
		// Only used when the JSON endpoint was unavailable.
		if (!meta.ISBN && (meta.DOI || meta.volume || meta.issue || meta.pages.includes('-'))) {
			meta.type = 'journalArticle';
		}
	}
}

function normalizePageRange(pages) {
	return ZU.trimInternal(pages || '').replace(/\s*(--|–|—)\s*/g, '-');
}

// LibGen prints "Label:" in front of every value, but the label and its value
// may sit in the same cell, in sibling cells, or in one cell separated by
// line breaks (ads.php). Match on the visible text and stop at the next label
// so we don't depend on the site's table markup.
function pageField(doc, label) {
	let test = 'starts-with(normalize-space(.), "' + label + ':")';
	let xpath = `//*[${test} and not(.//*[${test}])]`;
	for (let node of ZU.xpath(doc, xpath)) {
		let value = valueAfterLabel(node, label);
		if (value) return value;
	}
	// ads.php prints every label inside a single cell, behind a download link,
	// so no element there starts with a label. Take the innermost element that
	// contains one and split it on the <br> elements between the fields.
	let contains = 'contains(., "' + label + ':")';
	for (let node of ZU.xpath(doc, `//*[${contains} and not(.//*[${contains}])]`)) {
		for (let line of linesOf(node)) {
			let value = afterLabel(line, label);
			if (value) return value;
		}
	}
	return '';
}

function valueAfterLabel(node, label) {
	// <div><b>Title:</b> Deep Learning</div>
	let value = afterLabel(node.textContent, label);
	if (value) return value;
	// <td>Title:</td><td>Deep Learning</td>
	let sibling = node.nextElementSibling
		|| (node.parentElement && node.parentElement.nextElementSibling);
	if (sibling) {
		let text = ZU.trimInternal(sibling.textContent);
		// Don't run into the next labelled cell.
		if (text && !/^[A-Z][A-Za-z ()]*:/.test(text)) return text;
	}
	if (node.parentElement) {
		value = afterLabel(node.parentElement.textContent, label);
		if (value) return value;
	}
	return '';
}

function linesOf(node) {
	let text = '';
	for (let child of node.childNodes) {
		text += child.nodeName === 'BR' ? '\n' : child.textContent;
	}
	return text.split('\n');
}

function afterLabel(text, label) {
	text = ZU.trimInternal(text || '');
	if (!text.startsWith(label + ':')) return '';
	return cutAtNextLabel(text.slice(label.length + 1));
}

function cutAtNextLabel(text) {
	let end = text.length;
	for (let label of PAGE_LABELS) {
		let index = text.indexOf(label + ':');
		if (index > 0 && index < end) end = index;
	}
	return text.slice(0, end).trim();
}

function md5FromPage(doc) {
	for (let link of doc.querySelectorAll('a[href*="md5="]')) {
		let md5 = idFromURL(link.href, MD5_RE);
		if (md5) return md5.toLowerCase();
	}
	return (pageField(doc, 'MD5').match(/[0-9a-f]{32}/i) || [''])[0].toLowerCase();
}

function buildItem(meta, url, editionID, md5) {
	let item = new Zotero.Item(meta.type);
	item.title = meta.title;
	addCreators(item, meta.creators);
	setField(item, 'date', meta.date);
	setField(item, 'DOI', meta.DOI);
	setField(item, 'language', meta.language);
	setField(item, 'publisher', meta.publisher);
	setField(item, 'place', meta.place);
	setField(item, 'edition', meta.edition);
	setField(item, 'abstractNote', meta.abstractNote);

	// Exactly one of these is valid for any given item type.
	let container = meta.containerTitle || meta.series;
	setField(item, 'publicationTitle', container);
	setField(item, 'proceedingsTitle', container);
	setField(item, 'bookTitle', container);
	if (item.itemType === 'book') {
		setField(item, 'series', meta.series);
	}
	else if (item.itemType === 'bookSection' && meta.series !== container) {
		setField(item, 'series', meta.series);
	}

	if (item.itemType === 'bookSection') {
		setField(item, 'pages', meta.pages || meta.numPages);
	}
	else {
		setField(item, 'pages', meta.pages);
		setField(item, 'numPages', meta.numPages);
	}
	setField(item, 'volume', meta.volume);
	setField(item, 'issue', meta.issue);
	setField(item, 'ISBN', meta.ISBN);
	setField(item, 'ISSN', meta.ISSN);
	// Preprints name a repository rather than a publisher; keep the value
	// whichever field the item type actually supports.
	if (!ZU.fieldIsValidForType('publisher', item.itemType)) {
		setField(item, 'repository', meta.publisher);
	}

	let origin = originOf(url);
	item.url = editionID && origin ? origin + '/edition.php?id=' + editionID : url.split('#')[0];
	item.libraryCatalog = 'Library Genesis';
	// Hand-off identifiers: a copy of this record can be fetched again without
	// re-running a title search. No file is downloaded by this translator.
	let extra = [];
	if (editionID) extra.push('LibGen Edition ID: ' + editionID);
	if (md5) extra.push('LibGen MD5: ' + md5);
	if (extra.length) item.extra = extra.join('\n');
	return item;
}

function setField(item, field, value) {
	if (value && ZU.fieldIsValidForType(field, item.itemType)) {
		item[field] = value;
	}
}

function addCreators(item, creators) {
	let valid = ZU.getCreatorsForType(item.itemType);
	for (let creator of creators) {
		if (!valid.includes(creator.creatorType)) {
			creator.creatorType = valid.includes('author') ? 'author' : valid[0];
		}
		if (!creator.creatorType) continue;
		item.creators.push(creator);
	}
}

/** BEGIN TEST CASES **/
var testCases = [
	{
		"type": "web",
		"url": "https://libgen.li/edition.php?id=137966708",
		"items": [
			{
				"itemType": "book",
				"title": "Deep Learning",
				"creators": [
					{
						"firstName": "Ian",
						"lastName": "Goodfellow",
						"creatorType": "author"
					},
					{
						"firstName": "Yoshua",
						"lastName": "Bengio",
						"creatorType": "author"
					},
					{
						"firstName": "Aaron",
						"lastName": "Courville",
						"creatorType": "author"
					}
				],
				"date": "2016",
				"ISBN": "9780262035613",
				"extra": "LibGen Edition ID: 137966708\nLibGen MD5: f38e1015c84646e22c03a0b5e14a386a",
				"language": "English",
				"libraryCatalog": "Library Genesis",
				"numPages": "775",
				"publisher": "The MIT Press",
				"series": "Adaptive Computation and Machine Learning series",
				"url": "https://libgen.li/edition.php?id=137966708",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://libgen.li/edition.php?id=159758569",
		"items": [
			{
				"itemType": "journalArticle",
				"title": "Deep Learning Techniques for a Comprehensive Analysis of Fetal Biometric Parameters Across Trimesters",
				"creators": [
					{
						"firstName": "Shivanand",
						"lastName": "Gornale",
						"creatorType": "author"
					},
					{
						"firstName": "Priyanka",
						"lastName": "Kamat",
						"creatorType": "author"
					},
					{
						"firstName": "Rashmi",
						"lastName": "Siddalingappa",
						"creatorType": "author"
					},
					{
						"firstName": "Sathish",
						"lastName": "Kumar",
						"creatorType": "author"
					}
				],
				"date": "2024-07-14",
				"DOI": "10.14738/tecs.123.16985",
				"extra": "LibGen Edition ID: 159758569",
				"issue": "3",
				"libraryCatalog": "Library Genesis",
				"pages": "18-45",
				"publicationTitle": "Transactions on Machine Learning and Artificial Intelligence",
				"url": "https://libgen.li/edition.php?id=159758569",
				"volume": "12",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://libgen.li/file.php?id=93192691",
		"items": [
			{
				"itemType": "book",
				"title": "Deep Learning",
				"creators": [
					{
						"firstName": "Ian",
						"lastName": "Goodfellow",
						"creatorType": "author"
					},
					{
						"firstName": "Yoshua",
						"lastName": "Bengio",
						"creatorType": "author"
					},
					{
						"firstName": "Aaron",
						"lastName": "Courville",
						"creatorType": "author"
					}
				],
				"date": "2016",
				"ISBN": "9780262035613",
				"extra": "LibGen Edition ID: 137966708\nLibGen MD5: f38e1015c84646e22c03a0b5e14a386a",
				"language": "English",
				"libraryCatalog": "Library Genesis",
				"numPages": "775",
				"publisher": "The MIT Press",
				"series": "Adaptive Computation and Machine Learning series",
				"url": "https://libgen.li/edition.php?id=137966708",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://libgen.li/index.php?req=deep+learning&columns%5B%5D=title&objects%5B%5D=e&res=25&filesuns=all&curtab=e",
		"items": "multiple"
	}
]
/** END TEST CASES **/

var fs = require('fs'); // For reading and modifying the file system
var path = require('path'); // For manipulating file paths
var HTMLParser = require('node-html-parser'); // For parsing exported HTML
var assert = require('assert'); // For basic testing
var pretty = require('pretty'); // For prettifying HTML

// A config object for holding our configuration information—
var config = {
	"import": {
		"path": "../notes" // Where we've exported our Evernote notes to
	},
	"output": {
		"posts_path": "../_evernotes", // Where we want to store processed posts
		"media_path": "../media/evernote-export" // Where we want to store media associated with processed posts
	}
};

["import", "output"].forEach(function(pathType) { // Check that the folders we're reading from and writing to already exist
	for (pathKey in config[pathType]) {
		var pathname = config[pathType][pathKey];
		var pathExists = fs.existsSync(pathname);
		var errorMessage = ["Error: Expecting", pathname, "to exist and it doesn't…"].join(' ');
		assert(pathExists, errorMessage);
	}
});

// Begin reading in the files we want to import
console.log("Reading files from import directory", config.import.path);
pathnames = fs.readdirSync(config.import.path).map(p => path.join(config.import.path, p));

// Create an object for storing information about the original paths of our files
var originals = {};

// Filter paths for those ending in .html, removing Evernote's index.html
originals.html_files = pathnames.filter(p => p.match(/\.html$/) && !p.match(/index\.html$/));
console.log("Found html_files:\n", originals.html_files);
	
// Filter paths for those which are directories whose name ends in .resources
originals.resourceFolders = pathnames.filter(p => fs.lstatSync(p).isDirectory() && p.match(/\.resources/));
console.log("Found resource folders:\n", originals.resourceFolders);

// Create a list of all resource files for deletion once we're done with our import
originals.resourceFiles = originals.resourceFolders.map(function(rf) {
	var files = fs.readdirSync(rf);
	var paths = files.map(f => path.join(rf, f));
	return paths;
}).reduce((a, b) => a.concat(b));

// A function for extracting the body from an HTML file while rewriting media paths
var getCleanBodyFrom = function(filename) {
	var data = fs.readFileSync(filename, { "encoding": "utf-8" }); // Read the data
	var body = HTMLParser.parse(data).querySelector('body').innerHTML; // Extract the body
	originals.resourceFolders.forEach(function(rf) { // Replace all .resources directory paths with our media path
		var encodedRF = encodeURIComponent(path.basename(rf));
		body = body.replace(new RegExp(encodedRF, "g"), "{{ site.evernote_media_export_path }}");
	});

	var data = `---\n---\n${ pretty(body) }`;

	return data;
};

console.log("\nExtracting HTML files…");
originals.html_files.forEach(function(filepath) { // Copy over transformed HTML files
	console.log("Extracting the <body> from", filepath);
	var body = getCleanBodyFrom(filepath);
	var filename = path.basename(filepath).replace(/ /g, '-');
	var newPath = path.join(config.output.posts_path, filename);
	fs.writeFileSync(newPath, body);
});

console.log("\nMoving media resources…");
originals.resourceFolders.forEach(function(rf) { // Copy all media files into a common directory
	console.log("Exporting media from", rf, "to", config.output.media_path);
	var rawPaths = fs.readdirSync(rf).map(p => path.join(rf, p));
	var files = rawPaths.filter(p => fs.lstatSync(p).isFile());
	files.forEach(function(file) {
		var newPathname = path.join(config.output.media_path, path.basename(file));

		var fileAlreadyExists = fs.existsSync(newPathname);
		var overwriteErrorMessage = ["Error,", newPathname, "already exists and would be overwritten, skipping…"].join(' ');
		if (fileAlreadyExists) { // Check to make sure we aren't overwriting an existing file
			console.log(overwriteErrorMessage);
		}
		else { // And if we aren't copy the file over
			fs.copyFileSync(file, newPathname);
		}
	});
});

console.log("Removing the original import directory and included files…");
originals.html_files.forEach(fs.unlinkSync);
originals.resourceFiles.forEach(fs.unlinkSync);
originals.resourceFolders.forEach(fs.rmdirSync);
fs.rmdirSync(config.import.path);

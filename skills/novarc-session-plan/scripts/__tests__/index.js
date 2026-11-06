// Lets `node --test <this dir>/` work: Node 25 resolves a directory argument as a module, not as a test glob.
require('./medir-specs.test.js');
require('./capacidades.test.js');

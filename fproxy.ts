import cluster from 'node:cluster';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import node_util from "node:util";

(async()=>{
	"use strict";

	const argv = node_util.parseArgs({
		args: process.argv.slice(2),
		allowPositionals:true,
		options: {
			workers: {
				type: 'string',
				short: 'i',
				default: '4'
			},
			host: {
				type:'string',
				short: 'H',
				default: "127.0.0.1"
			},
			port: {
				type: 'string',
				short: 'p',
				default: '60080'
			}
		}
	});

	if ( argv.positionals.length < 1 ) {
		console.error("Usage: proxy [-H host] [-p port] {destUrl}");
		process.exit(1);
	}


	const numCPUs	= Number(argv.values.workers!);
	const bind_host = argv.values.host!;
	const bind_port = Number(argv.values.port!);
	const [destUrl] = argv.positionals as string[];



	if ( cluster.isPrimary ) {
		for (let i = 0; i < numCPUs; i++) {
			cluster.fork();
		}

		cluster.on('exit', (worker, code, signal) => {
			console.log(`Worker ${worker.process.pid} died`);
		});
	} 
	else {
		const server = http.createServer((req, res) => {
			const url = new URL(destUrl);

			const divider = req.url!.indexOf('?');
			const res_path = divider === -1 ? req.url! : req.url!.substring(0, divider);
			const query = divider === -1 ? '' : req.url!.substring(divider + 1);
			url.pathname = res_path;
			url.search = query;



			const protocol = url.protocol === 'https:' ? https : http;
			const bypass_headers = Object.assign({}, req.headers);
			delete bypass_headers['host'];
			delete bypass_headers['referer'];
			delete bypass_headers['origin'];


			
			const proxy = protocol.request(url.href, {
				method: req.method,
				headers: bypass_headers
			}, (proxyRes) => {
				res.writeHead(proxyRes.statusCode!, proxyRes.headers);
				proxyRes.pipe(res, {end:true});
			});

			req.pipe(proxy, {end: true}).on('error', (err) => {
				console.error(`Error in proxying request.`, err);
				res.writeHead(502);
				res.end('Proxy Error');
			});
		});

		server.listen(bind_port, bind_host as string, () => {
			console.log(`Proxy server running at http://${bind_host}:${bind_port}/`);
		});
	}
})();

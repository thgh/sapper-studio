import * as path from 'path';
import * as child_process from 'child_process';
import { remote, ipcRenderer } from 'electron';
import { Store } from 'svelte/store.js';

const { dir } = remote.getCurrentWindow();

let devWorker;

class StudioStore extends Store {
	constructor(data) {
		super(Object.assign({
			invalid: {}
		}, data));
	}

	selectFile(file, loc) {
		this.set({
			selectedFile: file
		});

		const { lastSelectedEditor } = this.get();

		if (lastSelectedEditor) {
			lastSelectedEditor.load(file);
			if (loc) lastSelectedEditor.locate(loc.line, loc.column);
		}
	}

	send(message, data) {
		ipcRenderer.send(message, data);
	}

	startDev() {
		if (devWorker) {
			throw new Error(`Already running`);
		}

		this.set({
			startingDev: true,
			mode: 'dev'
		});

		const workerPath = path.resolve(__dirname, '../workers/sapper-dev.js');
		devWorker = child_process.fork(workerPath, [], {
			cwd: dir,
			stdio: ['ipc']
		});

		devWorker.stdout.on('data', data => {
			const { stdout, combined } = this.get();

			this.set({
				stdout: stdout + data,
				combined: combined + data
			});

			this.fire('stdout', data.toString());
		});

		devWorker.stderr.on('data', data => {
			const { stderr, combined } = this.get();

			this.set({
				stderr: stderr + data,
				combined: combined + data
			});

			this.fire('stderr', data.toString());
		});

		devWorker.on('message', message => {
			switch (message.type) {
				case 'build':
					this.set({
						[`${message.event.type.replace(' ', '')}Stats`]: message.event,
						invalid: {
							client: false,
							server: false,
							serviceworker: false
						}
					});
					break;

				case 'invalid':
					this.set({
						invalid: message.event.invalid
					});
					break;

				case 'fatal':
					console.log(`fatal ${message.error.message}`);
					break;

				case 'error':
				console.log(`error ${message.error.message}`);
					break;

				case 'ready':
					setTimeout(() => {
						console.log('message', message.port);
						this.set({
							startingDev: false,
							runningDev: true,
							stdout: '',
							stderr: '',
							combined: '', // TODO show 'restarted' message as appropriate
							port: message.port
						});
					});

					break;
			}
		});

		devWorker.on('error', err => {
			// TODO can this ever happen?
			console.error(err);
		});
	}

	stopDev() {
		if (devWorker) {
			devWorker.kill();
			devWorker = null;
		}

		this.set({
			startingDev: false,
			runningDev: false,
			port: null,
			mode: null
		});
	}
}

const store = new StudioStore({
	dir,
	metaKey: /win/i.test(navigator.platform) ? 'Ctrl' : 'Cmd',
	combined: ''
});

export default store;
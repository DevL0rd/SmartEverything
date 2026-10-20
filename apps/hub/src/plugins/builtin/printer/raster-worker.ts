import { parentPort } from 'node:worker_threads';
import { serveRaster } from './raster-serve';

if (parentPort === null) throw new Error('The raster worker must run as a worker thread.');

serveRaster(parentPort);

import serverless from 'serverless-http';
import { createApp } from '../../src/app';

export const handler = serverless(createApp());

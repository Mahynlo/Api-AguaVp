
import { jest } from '@jest/globals';

const mockExecute = jest.fn();

const db = {
    execute: mockExecute,
};

export default db;
export { mockExecute };

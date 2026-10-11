
import { jest } from '@jest/globals';

const mockExecute = jest.fn();

const dbTurso = {
    execute: mockExecute,
};

export default dbTurso;
export { mockExecute };

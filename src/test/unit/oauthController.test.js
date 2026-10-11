
import { jest } from '@jest/globals';

// 1. Mock DB Module BEFORE importing controller
jest.unstable_mockModule('../../database/db-sqlite.js', () => ({
    default: {
        execute: jest.fn()
    }
}));

// Mock bcrypt
jest.unstable_mockModule('bcryptjs', () => ({
    default: {
        compare: jest.fn().mockResolvedValue(true),
        hash: jest.fn().mockResolvedValue('hashed_password')
    }
}));

// Dynamic imports
const { default: oauthController } = await import('../../v2/controllers/oauthController.js');
const { default: dbTurso } = await import('../../database/db-sqlite.js');
const bcrypt = (await import('bcryptjs')).default;

describe('OAuthController', () => {
    let mockReq;
    let mockRes;

    beforeEach(() => {
        mockReq = {
            body: {},
            appInstancia: { id: 'app_123' } // Simulating appKeyMiddleware success
        };
        mockRes = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis()
        };
        jest.clearAllMocks();
    });

    test('debe rechazar grant_type desconocido', async () => {
        mockReq.body = { grant_type: 'unknown' };
        await oauthController.token(mockReq, mockRes);
        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('grant_type') }));
    });

    // Password Grant
    test('Password Grant: debe generar tokens con credenciales validas', async () => {
        mockReq.body = {
            grant_type: 'password',
            username: 'test@test.com',
            password: 'password'
        };

        // Mock User Search
        dbTurso.execute.mockResolvedValueOnce({
            rows: [{
                id: 1,
                correo: 'test@test.com',
                contraseña: 'hashed',
                rol: 'admin'
            }]
        });

        // Mock bcrypt (already matched in module mock, but ensuring)
        bcrypt.compare.mockResolvedValue(true);

        // Mock Token Inserts (Sesiones, RefreshTokens)
        dbTurso.execute.mockResolvedValue({ rows: [] });

        await oauthController.token(mockReq, mockRes);

        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
            access_token: expect.any(String),
            refresh_token: expect.any(String),
            token_type: 'Bearer',
            expires_in: 900
        }));
    });

    test('Password Grant: debe rechazar credenciales invalidas', async () => {
        mockReq.body = {
            grant_type: 'password',
            username: 'test@test.com',
            password: 'wrong'
        };

        // Mock User Search
        dbTurso.execute.mockResolvedValueOnce({
            rows: [{
                id: 1,
                contraseña: 'hashed'
            }]
        });

        bcrypt.compare.mockResolvedValue(false);

        await oauthController.token(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    // Refresh Token Grant
    test('Refresh Grant: debe renovar tokens', async () => {
        mockReq.body = {
            grant_type: 'refresh_token',
            refresh_token: 'valid_rt'
        };

        // 1. RT Search - Valid and future expiry
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 1);

        dbTurso.execute.mockResolvedValueOnce({
            rows: [{
                id: 10,
                token: 'valid_rt',
                usuario_id: 1,
                revocado: 0,
                expira_en: futureDate.toISOString()
            }]
        });

        // 2. App ID lookup (internal) - Used in generateTokens logic
        // The controller does: Select id FROM apps WHERE app_id = ?
        dbTurso.execute.mockResolvedValueOnce({ rows: [{ id: 99 }] });

        // 3. User Lookup
        dbTurso.execute.mockResolvedValueOnce({
            rows: [{ id: 1, rol: 'admin' }]
        });

        // 4. Update RT (Revocation of old)
        dbTurso.execute.mockResolvedValueOnce({});

        // 5. Insert New Session & RT
        dbTurso.execute.mockResolvedValue({});

        await oauthController.token(mockReq, mockRes);

        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
            access_token: expect.any(String),
            refresh_token: expect.any(String)
        }));
    });
});

import 'dotenv/config';
import dashboardController from '../v2/controllers/dashboardController.js';

const mockReq = {};
const mockRes = {
    status: (code) => {
        console.log(`Response Status: ${code}`);
        return mockRes;
    },
    json: (data) => {
        console.log('Response JSON:', JSON.stringify(data, null, 2));
        return mockRes;
    }
};

console.log('Running Dashboard Controller Test...');
dashboardController.getDashboardStats(mockReq, mockRes)
    .then(() => console.log('Test Finished'))
    .catch(err => console.error('Test Error:', err));

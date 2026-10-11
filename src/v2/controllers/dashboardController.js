import { getDashboardStats } from '../services/dashboardService.js';

const dashboardController = {

    getDashboardStats: async (req, res) => {
        try {
            const data = await getDashboardStats();
            res.json(data);
        } catch (error) {
            console.error("Error obteniendo datos del dashboard:", error);
            res.status(500).json({ error: "Error interno al obtener datos del dashboard" });
        }
    }
};

export default dashboardController;

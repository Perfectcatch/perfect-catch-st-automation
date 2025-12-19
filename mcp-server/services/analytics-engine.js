/**
 * Analytics Engine Service
 * Provides business intelligence and forecasting
 */

import pg from 'pg';

const { Pool } = pg;

let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

export class AnalyticsEngine {
  
  /**
   * Get KPI dashboard data
   */
  async getKPIDashboard(dateRange = 30) {
    const client = await getPool().connect();
    
    try {
      const [revenue, jobs, estimates, customers] = await Promise.all([
        // Revenue metrics
        client.query(`
          SELECT 
            COALESCE(SUM(total), 0) as total_revenue,
            COUNT(*) as invoice_count,
            COALESCE(AVG(total), 0) as avg_ticket
          FROM st_invoices
          WHERE st_created_on >= NOW() - INTERVAL '${dateRange} days'
        `),
        
        // Job metrics
        client.query(`
          SELECT 
            COUNT(*) as total_jobs,
            COUNT(*) FILTER (WHERE job_status = 'Completed') as completed_jobs,
            COUNT(*) FILTER (WHERE job_status = 'Scheduled') as scheduled_jobs
          FROM st_jobs
          WHERE st_created_on >= NOW() - INTERVAL '${dateRange} days'
        `),
        
        // Estimate metrics
        client.query(`
          SELECT 
            COUNT(*) as total_estimates,
            COUNT(*) FILTER (WHERE status = 'Sold') as sold_estimates,
            COALESCE(SUM(total) FILTER (WHERE status = 'Sold'), 0) as sold_value
          FROM st_estimates
          WHERE st_created_on >= NOW() - INTERVAL '${dateRange} days'
        `),
        
        // Customer metrics
        client.query(`
          SELECT 
            COUNT(*) as new_customers
          FROM st_customers
          WHERE st_created_on >= NOW() - INTERVAL '${dateRange} days'
        `)
      ]);
      
      const revenueData = revenue.rows[0];
      const jobData = jobs.rows[0];
      const estimateData = estimates.rows[0];
      const customerData = customers.rows[0];
      
      const conversionRate = Number(estimateData.total_estimates) > 0 ?
        (Number(estimateData.sold_estimates) / Number(estimateData.total_estimates)) * 100 : 0;
      
      return {
        dateRange: `Last ${dateRange} days`,
        revenue: {
          total: Number(revenueData.total_revenue),
          invoiceCount: Number(revenueData.invoice_count),
          avgTicket: Number(revenueData.avg_ticket)
        },
        jobs: {
          total: Number(jobData.total_jobs),
          completed: Number(jobData.completed_jobs),
          scheduled: Number(jobData.scheduled_jobs),
          completionRate: Number(jobData.total_jobs) > 0 ?
            (Number(jobData.completed_jobs) / Number(jobData.total_jobs)) * 100 : 0
        },
        estimates: {
          total: Number(estimateData.total_estimates),
          sold: Number(estimateData.sold_estimates),
          soldValue: Number(estimateData.sold_value),
          conversionRate
        },
        customers: {
          newCustomers: Number(customerData.new_customers)
        }
      };
    } finally {
      client.release();
    }
  }
  
  /**
   * Get revenue analytics with trends
   */
  async getRevenueAnalytics(period = 'month') {
    const client = await getPool().connect();
    
    try {
      let groupBy, interval;
      switch (period) {
        case 'week':
          groupBy = "DATE_TRUNC('day', st_created_on)";
          interval = '7 days';
          break;
        case 'month':
          groupBy = "DATE_TRUNC('week', st_created_on)";
          interval = '30 days';
          break;
        case 'quarter':
          groupBy = "DATE_TRUNC('month', st_created_on)";
          interval = '90 days';
          break;
        case 'year':
          groupBy = "DATE_TRUNC('month', st_created_on)";
          interval = '365 days';
          break;
        default:
          groupBy = "DATE_TRUNC('week', st_created_on)";
          interval = '30 days';
      }
      
      const result = await client.query(`
        SELECT 
          ${groupBy} as period,
          COALESCE(SUM(total), 0) as revenue,
          COUNT(*) as invoice_count
        FROM st_invoices
        WHERE st_created_on >= NOW() - INTERVAL '${interval}'
        GROUP BY ${groupBy}
        ORDER BY period
      `);
      
      const data = result.rows.map(r => ({
        period: r.period,
        revenue: Number(r.revenue),
        invoiceCount: Number(r.invoice_count)
      }));
      
      // Calculate trend
      const trend = data.length >= 2 ?
        ((data[data.length - 1].revenue - data[0].revenue) / Math.max(data[0].revenue, 1)) * 100 : 0;
      
      return {
        period,
        data,
        summary: {
          totalRevenue: data.reduce((sum, d) => sum + d.revenue, 0),
          avgRevenue: data.length > 0 ? data.reduce((sum, d) => sum + d.revenue, 0) / data.length : 0,
          trend: trend > 0 ? `+${trend.toFixed(1)}%` : `${trend.toFixed(1)}%`,
          trendDirection: trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat'
        }
      };
    } finally {
      client.release();
    }
  }
  
  /**
   * Get technician performance metrics
   */
  async getTechnicianPerformance(dateRange = 30) {
    const client = await getPool().connect();
    
    try {
      const result = await client.query(`
        SELECT 
          t.st_id,
          t.name,
          COUNT(DISTINCT j.st_id) as job_count,
          COALESCE(SUM(i.total), 0) as revenue_generated,
          COUNT(DISTINCT j.st_id) FILTER (WHERE j.job_status = 'Completed') as completed_jobs
        FROM st_technicians t
        LEFT JOIN st_jobs j ON j.technician_id = t.st_id
          AND j.st_created_on >= NOW() - INTERVAL '${dateRange} days'
        LEFT JOIN st_invoices i ON i.job_id = j.st_id
        GROUP BY t.st_id, t.name
        ORDER BY revenue_generated DESC
      `);
      
      return result.rows.map(t => ({
        technicianId: Number(t.st_id),
        name: t.name,
        jobCount: Number(t.job_count),
        completedJobs: Number(t.completed_jobs),
        revenueGenerated: Number(t.revenue_generated),
        avgRevenuePerJob: Number(t.job_count) > 0 ?
          Number(t.revenue_generated) / Number(t.job_count) : 0,
        completionRate: Number(t.job_count) > 0 ?
          (Number(t.completed_jobs) / Number(t.job_count)) * 100 : 0
      }));
    } finally {
      client.release();
    }
  }
  
  /**
   * Forecast revenue for upcoming period
   */
  async forecastRevenue(months = 3) {
    const client = await getPool().connect();
    
    try {
      // Get historical monthly revenue
      const result = await client.query(`
        SELECT 
          DATE_TRUNC('month', st_created_on) as month,
          COALESCE(SUM(total), 0) as revenue
        FROM st_invoices
        WHERE st_created_on >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', st_created_on)
        ORDER BY month
      `);
      
      const historical = result.rows.map(r => ({
        month: r.month,
        revenue: Number(r.revenue)
      }));
      
      if (historical.length < 3) {
        return {
          success: false,
          error: 'Not enough historical data for forecasting'
        };
      }
      
      // Simple moving average forecast
      const recentMonths = historical.slice(-3);
      const avgRevenue = recentMonths.reduce((sum, m) => sum + m.revenue, 0) / 3;
      
      // Calculate growth rate
      const growthRate = historical.length >= 6 ?
        (historical.slice(-3).reduce((s, m) => s + m.revenue, 0) -
         historical.slice(-6, -3).reduce((s, m) => s + m.revenue, 0)) /
        Math.max(historical.slice(-6, -3).reduce((s, m) => s + m.revenue, 0), 1) : 0;
      
      // Generate forecast
      const forecast = [];
      let currentRevenue = avgRevenue;
      
      for (let i = 1; i <= months; i++) {
        const forecastMonth = new Date();
        forecastMonth.setMonth(forecastMonth.getMonth() + i);
        
        currentRevenue = currentRevenue * (1 + growthRate / 3);
        
        forecast.push({
          month: forecastMonth.toISOString().slice(0, 7),
          forecastedRevenue: Math.round(currentRevenue),
          confidence: Math.max(0.5, 0.9 - (i * 0.1))
        });
      }
      
      return {
        success: true,
        historical: historical.slice(-6),
        forecast,
        methodology: 'Moving average with growth rate adjustment',
        assumptions: {
          baselineRevenue: Math.round(avgRevenue),
          monthlyGrowthRate: `${(growthRate / 3 * 100).toFixed(1)}%`
        }
      };
    } finally {
      client.release();
    }
  }
  
  /**
   * Get trending services
   */
  async getTrendingServices(dateRange = 30) {
    const client = await getPool().connect();
    
    try {
      const result = await client.query(`
        SELECT 
          job_type_name as service_type,
          COUNT(*) as job_count,
          COALESCE(SUM(i.total), 0) as revenue
        FROM st_jobs j
        LEFT JOIN st_invoices i ON i.job_id = j.st_id
        WHERE j.st_created_on >= NOW() - INTERVAL '${dateRange} days'
          AND job_type_name IS NOT NULL
        GROUP BY job_type_name
        ORDER BY job_count DESC
        LIMIT 10
      `);
      
      return result.rows.map((r, index) => ({
        rank: index + 1,
        serviceType: r.service_type,
        jobCount: Number(r.job_count),
        revenue: Number(r.revenue)
      }));
    } finally {
      client.release();
    }
  }
}

export const analyticsEngine = new AnalyticsEngine();

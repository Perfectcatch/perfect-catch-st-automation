/**
 * Route Optimizer Service
 * Optimizes technician routes for multiple appointments
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

export class RouteOptimizer {
  
  /**
   * Optimize route for a technician's appointments
   */
  async optimizeRoute(params) {
    const { technicianId, appointmentIds, startLocation, date } = params;
    const client = await getPool().connect();
    
    try {
      // Get appointments with locations
      const result = await client.query(`
        SELECT 
          a.st_id,
          a.start_on,
          a.end_on,
          j.st_id as job_id,
          c.name as customer_name,
          c.address_line1,
          c.address_line2,
          c.city,
          c.state,
          c.zip
        FROM st_appointments a
        JOIN st_jobs j ON a.job_id = j.st_id
        JOIN st_customers c ON j.customer_id = c.st_id
        WHERE a.st_id = ANY($1::bigint[])
      `, [appointmentIds]);
      
      const appointments = result.rows;
      
      if (appointments.length === 0) {
        return { success: false, error: 'No appointments found' };
      }
      
      // Build locations array
      const locations = appointments.map(apt => ({
        id: Number(apt.st_id),
        customerName: apt.customer_name,
        address: `${apt.address_line1 || ''}, ${apt.city || ''}, ${apt.state || ''} ${apt.zip || ''}`,
        // Use mock coordinates (in production, geocode addresses)
        lat: 26.1 + Math.random() * 0.2,
        lng: -80.1 + Math.random() * 0.2,
        duration: 60 // Default 1 hour
      }));
      
      // Add start location
      const start = {
        id: 'start',
        customerName: 'Start Location',
        address: startLocation?.address || 'Office',
        lat: startLocation?.lat || 26.1,
        lng: startLocation?.lng || -80.1,
        duration: 0
      };
      
      // Calculate distances between all points
      const distances = this.calculateDistanceMatrix([start, ...locations]);
      
      // Solve TSP using nearest neighbor
      const route = this.solveTSP(distances, [start, ...locations]);
      
      // Calculate totals
      const totalDriveTime = route.reduce((sum, leg) => sum + leg.driveTime, 0);
      const totalJobTime = locations.reduce((sum, loc) => sum + loc.duration, 0);
      const totalDistance = route.reduce((sum, leg) => sum + leg.distanceMiles, 0);
      
      return {
        success: true,
        optimizedOrder: route.map(leg => leg.toId).filter(id => id !== 'start'),
        route: route.map(leg => ({
          from: leg.fromName,
          to: leg.toName,
          distanceMiles: Math.round(leg.distanceMiles * 10) / 10,
          driveTimeMinutes: Math.round(leg.driveTime)
        })),
        summary: {
          totalDriveTimeMinutes: Math.round(totalDriveTime),
          totalJobTimeMinutes: totalJobTime,
          totalTimeMinutes: Math.round(totalDriveTime + totalJobTime),
          totalDistanceMiles: Math.round(totalDistance * 10) / 10,
          appointmentCount: locations.length
        }
      };
    } finally {
      client.release();
    }
  }
  
  /**
   * Calculate distance matrix between all points
   */
  calculateDistanceMatrix(locations) {
    const matrix = {};
    
    for (let i = 0; i < locations.length; i++) {
      for (let j = 0; j < locations.length; j++) {
        if (i === j) continue;
        
        const from = locations[i];
        const to = locations[j];
        
        const distanceMiles = this.haversineDistance(
          from.lat, from.lng,
          to.lat, to.lng
        );
        
        // Estimate drive time (avg 25 mph in urban areas)
        const driveMinutes = (distanceMiles / 25) * 60;
        
        matrix[`${from.id}-${to.id}`] = {
          fromId: from.id,
          toId: to.id,
          fromName: from.customerName,
          toName: to.customerName,
          distanceMiles,
          driveTime: driveMinutes
        };
      }
    }
    
    return matrix;
  }
  
  /**
   * Calculate haversine distance between two points
   */
  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth radius in miles
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  
  /**
   * Convert degrees to radians
   */
  toRad(degrees) {
    return degrees * Math.PI / 180;
  }
  
  /**
   * Solve TSP using nearest neighbor algorithm
   */
  solveTSP(distances, locations) {
    const route = [];
    let current = 'start';
    const visited = new Set([current]);
    const allIds = locations.map(l => l.id).filter(id => id !== 'start');
    
    while (visited.size <= allIds.length) {
      let nearest = null;
      let shortestDistance = Infinity;
      
      for (const id of allIds) {
        if (visited.has(id)) continue;
        
        const key = `${current}-${id}`;
        const dist = distances[key];
        
        if (dist && dist.distanceMiles < shortestDistance) {
          shortestDistance = dist.distanceMiles;
          nearest = dist;
        }
      }
      
      if (nearest) {
        route.push(nearest);
        visited.add(nearest.toId);
        current = nearest.toId;
      } else {
        break;
      }
    }
    
    return route;
  }
  
  /**
   * Get technician availability
   */
  async getTechnicianAvailability(technicianId, date) {
    const client = await getPool().connect();
    
    try {
      const result = await client.query(`
        SELECT 
          a.st_id,
          a.start_on,
          a.end_on,
          j.job_number,
          c.name as customer_name
        FROM st_appointments a
        JOIN st_jobs j ON a.job_id = j.st_id
        JOIN st_customers c ON j.customer_id = c.st_id
        WHERE a.technician_id = $1
          AND DATE(a.start_on) = $2
        ORDER BY a.start_on
      `, [technicianId, date]);
      
      const appointments = result.rows;
      
      // Calculate available slots (8 AM - 6 PM)
      const workdayStart = new Date(date);
      workdayStart.setHours(8, 0, 0, 0);
      const workdayEnd = new Date(date);
      workdayEnd.setHours(18, 0, 0, 0);
      
      const bookedSlots = appointments.map(a => ({
        start: new Date(a.start_on),
        end: new Date(a.end_on),
        jobNumber: a.job_number,
        customerName: a.customer_name
      }));
      
      // Find gaps
      const availableSlots = [];
      let currentTime = workdayStart;
      
      for (const slot of bookedSlots) {
        if (currentTime < slot.start) {
          availableSlots.push({
            start: currentTime.toISOString(),
            end: slot.start.toISOString(),
            durationMinutes: (slot.start - currentTime) / 60000
          });
        }
        currentTime = slot.end > currentTime ? slot.end : currentTime;
      }
      
      if (currentTime < workdayEnd) {
        availableSlots.push({
          start: currentTime.toISOString(),
          end: workdayEnd.toISOString(),
          durationMinutes: (workdayEnd - currentTime) / 60000
        });
      }
      
      return {
        technicianId,
        date,
        bookedAppointments: bookedSlots.length,
        totalBookedMinutes: bookedSlots.reduce((sum, s) => sum + (s.end - s.start) / 60000, 0),
        availableSlots,
        utilization: bookedSlots.length > 0 ? 
          (bookedSlots.reduce((sum, s) => sum + (s.end - s.start), 0) / (workdayEnd - workdayStart)) : 0
      };
    } finally {
      client.release();
    }
  }
}

export const routeOptimizer = new RouteOptimizer();

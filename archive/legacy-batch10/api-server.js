import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ---------------------------------------------------------------
// HEALTH CHECK
// ---------------------------------------------------------------
app.get("/ping", (req, res) => {
    res.json({ msg: "ServiceTitan MCP API is running" });
});

// ---------------------------------------------------------------
// INTERNAL FUNCTION — FETCH ACCESS TOKEN (working version)
// ---------------------------------------------------------------
async function getAccessToken() {
    const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
    const clientId = process.env.SERVICE_TITAN_CLIENT_ID;
    const clientSecret = process.env.SERVICE_TITAN_CLIENT_SECRET;

    const tokenUrl = "https://auth.servicetitan.io/connect/token";

    const body = new URLSearchParams();
    body.append("grant_type", "client_credentials");
    body.append("client_id", clientId);
    body.append("client_secret", clientSecret);

    const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "x-tenant-id": tenantId
        },
        body
    });

    const data = await response.json();

    if (!response.ok || !data.access_token) {
        console.error("❌ Failed to get token:", data);
        throw new Error("Failed to retrieve ServiceTitan access token");
    }

    return data.access_token;
}

// ---------------------------------------------------------------
// UNIVERSAL ST CALL WRAPPER (passes all query params)
// ---------------------------------------------------------------
async function stCall(baseUrl, req, res) {
    try {
        const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
        const appKey = process.env.SERVICE_TITAN_APP_KEY;
        const token = await getAccessToken();

        // Build final URL with all query params forwarded
        let url = baseUrl;
        const qs = new URLSearchParams(req.query).toString();
        if (qs) url += `?${qs}`;

        console.log("➡️  Calling:", url);

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
                "ST-App-Key": appKey,
                "Content-Type": "application/json"
            }
        });

        const data = await response.json();
        return res.status(response.status).json(data);

    } catch (err) {
        console.error("🔥 ST Proxy Error:", err);
        res.status(500).json({ error: err.message });
    }
}

// ---------------------------------------------------------------
// JOBS (THIS WAS WORKING — UNCHANGED)
// ---------------------------------------------------------------
app.get("/jobs", async (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;

    const url =
        `https://api.servicetitan.io/jpm/v2/tenant/${tenant}/jobs`;

    return stCall(url, req, res);
});

// ---------------------------------------------------------------
// CUSTOMERS LIST (Full Query Param Support)
// ---------------------------------------------------------------
app.get("/customers", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;

    const url =
        `https://api.servicetitan.io/crm/v2/tenant/${tenant}/customers`;

    return stCall(url, req, res);
});

// ---------------------------------------------------------------
// MODIFIED CONTACTS LIST (Bulk Search)
// ---------------------------------------------------------------
app.get("/customers/contacts", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;

    const url =
        `https://api.servicetitan.io/crm/v2/tenant/${tenant}/customers/contacts`;

    return stCall(url, req, res);
});

// ---------------------------------------------------------------
// GET A SINGLE CUSTOMER BY ID
// ---------------------------------------------------------------
app.get("/customers/:id", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;
    const { id } = req.params;

    const url =
        `https://api.servicetitan.io/crm/v2/tenant/${tenant}/customers/${id}`;

    return stCall(url, req, res);
});

// ---------------------------------------------------------------
// GET CONTACT LIST FOR A SPECIFIC CUSTOMER
// ---------------------------------------------------------------
app.get("/customers/:id/contacts", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;
    const { id } = req.params;

    const url =
        `https://api.servicetitan.io/crm/v2/tenant/${tenant}/customers/${id}/contacts`;

    return stCall(url, req, res);
});

// ---------------------------------------------------------------
// SALES / ESTIMATES (V2) — **PRODUCTION ENVIRONMENT**
// ---------------------------------------------------------------

// GET estimate by ID
app.get("/estimates/:id", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;
    const { id } = req.params;

    const url = `https://api.servicetitan.io/sales/v2/tenant/${tenant}/estimates/${id}`;
    return stCall(url, req, res);
});

// LIST estimates
app.get("/estimates", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;

    const url = `https://api.servicetitan.io/sales/v2/tenant/${tenant}/estimates`;
    return stCall(url, req, res);
});

// CREATE estimate
app.post("/estimates", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;

    const url = `https://api.servicetitan.io/sales/v2/tenant/${tenant}/estimates`;
    return stCall(url, req, res);
});

// UPDATE estimate
app.put("/estimates/:id", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;
    const { id } = req.params;

    const url = `https://api.servicetitan.io/sales/v2/tenant/${tenant}/estimates/${id}`;
    return stCall(url, req, res);
});

// SELL estimate
app.put("/estimates/:id/sell", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;
    const { id } = req.params;

    const url = `https://api.servicetitan.io/sales/v2/tenant/${tenant}/estimates/${id}/sell`;
    return stCall(url, req, res);
});

// UNSELL estimate
app.put("/estimates/:id/unsell", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;
    const { id } = req.params;

    const url = `https://api.servicetitan.io/sales/v2/tenant/${tenant}/estimates/${id}/unsell`;
    return stCall(url, req, res);
});

// DISMISS estimate
app.put("/estimates/:id/dismiss", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;
    const { id } = req.params;

    const url = `https://api.servicetitan.io/sales/v2/tenant/${tenant}/estimates/${id}/dismiss`;
    return stCall(url, req, res);
});

// LIST estimate items (estimateId in query)
app.get("/estimates/:id/items", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;
    const { id } = req.params;

    const url = `https://api.servicetitan.io/sales/v2/tenant/${tenant}/estimates/items?estimateId=${id}`;
    return stCall(url, req, res);
});

// UPDATE estimate items
app.put("/estimates/:id/items", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;
    const { id } = req.params;

    const url = `https://api.servicetitan.io/sales/v2/tenant/${tenant}/estimates/${id}/items`;
    return stCall(url, req, res);
});

// DELETE estimate item
app.delete("/estimates/:id/items/:itemId", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;
    const { id, itemId } = req.params;

    const url = `https://api.servicetitan.io/sales/v2/tenant/${tenant}/estimates/${id}/items/${itemId}`;
    return stCall(url, req, res);
});

// ---------------------------------------------------------------
// OPPORTUNITIES (salestech v2)
// ---------------------------------------------------------------

// GET opportunity by ID
app.get("/opportunities/:id", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;
    const { id } = req.params;

    const url = `https://api.servicetitan.io/salestech/v2/tenant/${tenant}/opportunities/${id}`;
    return stCall(url, req, res);
});

// LIST opportunities
app.get("/opportunities", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;

    const url = `https://api.servicetitan.io/salestech/v2/tenant/${tenant}/opportunities`;
    return stCall(url, req, res);
});

// LIST opportunity follow-ups
app.get("/opportunities/:id/followups", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;
    const { id } = req.params;

    const url = `https://api.servicetitan.io/salestech/v2/tenant/${tenant}/opportunities/${id}/followups`;
    return stCall(url, req, res);
});

// ---------------------------------------------------------------
// TECHNICIANS
// ---------------------------------------------------------------
app.get("/technicians", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;
    const url = `https://api.servicetitan.io/settings/v2/tenant/${tenant}/technicians`;
    return stCall(url, req, res);
});

app.get("/technicians/:id", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;
    const { id } = req.params;
    const url = `https://api.servicetitan.io/settings/v2/tenant/${tenant}/technicians/${id}`;
    return stCall(url, req, res);
});

// ---------------------------------------------------------------
// DISPATCH - TECHNICIAN SHIFTS
// ---------------------------------------------------------------
app.get("/dispatch/technician-shifts", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;
    const url = `https://api.servicetitan.io/dispatch/v2/tenant/${tenant}/technician-shifts`;
    return stCall(url, req, res);
});

// ---------------------------------------------------------------
// DISPATCH - CAPACITY
// ---------------------------------------------------------------
app.get("/dispatch/capacity", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;
    const url = `https://api.servicetitan.io/dispatch/v2/tenant/${tenant}/capacity`;
    return stCall(url, req, res);
});

// ---------------------------------------------------------------
// DISPATCH - APPOINTMENT ASSIGNMENTS
// ---------------------------------------------------------------
app.get("/dispatch/appointment-assignments", (req, res) => {
    const tenant = process.env.SERVICE_TITAN_TENANT_ID;
    const url = `https://api.servicetitan.io/dispatch/v2/tenant/${tenant}/appointment-assignments`;
    return stCall(url, req, res);
});

// ---------------------------------------------------------------
// VAPI - TECHNICIAN AVAILABILITY (Real-time check)
// Combines technician shifts, capacity, and assignments
// ---------------------------------------------------------------
app.get("/vapi/technician-availability", async (req, res) => {
    try {
        const tenant = process.env.SERVICE_TITAN_TENANT_ID;
        const appKey = process.env.SERVICE_TITAN_APP_KEY;
        const token = await getAccessToken();

        const headers = {
            "Authorization": `Bearer ${token}`,
            "ST-App-Key": appKey,
            "Content-Type": "application/json"
        };

        // Parse query params
        const { date, technicianIds, businessUnitId } = req.query;
        
        // Default to today if no date provided
        const targetDate = date || new Date().toISOString().split('T')[0];
        const startsOnOrAfter = `${targetDate}T00:00:00Z`;
        const startsOnOrBefore = `${targetDate}T23:59:59Z`;

        console.log(`➡️  VAPI Availability Check: date=${targetDate}, technicianIds=${technicianIds || 'all'}`);

        // Build technician shifts URL with date filter
        let shiftsUrl = `https://api.servicetitan.io/dispatch/v2/tenant/${tenant}/technician-shifts?startsOnOrAfter=${startsOnOrAfter}&endsOnOrBefore=${startsOnOrBefore}`;
        if (technicianIds) {
            shiftsUrl += `&technicianIds=${technicianIds}`;
        }

        // Fetch technician shifts for the date
        const shiftsResponse = await fetch(shiftsUrl, { method: "GET", headers });
        const shiftsData = await shiftsResponse.json();

        // Fetch technicians list to get names
        let techUrl = `https://api.servicetitan.io/settings/v2/tenant/${tenant}/technicians?active=true`;
        if (businessUnitId) {
            techUrl += `&businessUnitId=${businessUnitId}`;
        }
        const techResponse = await fetch(techUrl, { method: "GET", headers });
        const techData = await techResponse.json();

        // Build technician lookup map
        const techMap = {};
        if (techData.data) {
            techData.data.forEach(tech => {
                techMap[tech.id] = {
                    id: tech.id,
                    name: tech.name,
                    businessUnitId: tech.businessUnitId,
                    active: tech.active
                };
            });
        }

        // Process shifts into availability
        const availability = [];
        if (shiftsData.data) {
            shiftsData.data.forEach(shift => {
                const tech = techMap[shift.technicianId] || { name: `Technician ${shift.technicianId}` };
                availability.push({
                    technicianId: shift.technicianId,
                    technicianName: tech.name,
                    date: targetDate,
                    shiftStart: shift.start,
                    shiftEnd: shift.end,
                    active: shift.active !== false,
                    businessUnitId: tech.businessUnitId
                });
            });
        }

        // Return VAPI-friendly response
        res.json({
            success: true,
            date: targetDate,
            totalTechnicians: availability.length,
            availability,
            message: availability.length > 0 
                ? `Found ${availability.length} technician(s) with shifts on ${targetDate}`
                : `No technicians with shifts found for ${targetDate}`
        });

    } catch (err) {
        console.error("🔥 VAPI Availability Error:", err);
        res.status(500).json({ 
            success: false, 
            error: err.message,
            message: "Failed to check technician availability"
        });
    }
});

// ---------------------------------------------------------------
// HEALTH CHECK (for container health)
// ---------------------------------------------------------------
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------
// START SERVER
// ---------------------------------------------------------------
app.listen(3001, () => {
    console.log("ServiceTitan API container running on port 3001");
});
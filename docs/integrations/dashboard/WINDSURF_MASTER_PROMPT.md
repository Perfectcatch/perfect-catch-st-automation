# 🚀 WINDSURF MASTER PROMPT: Build Complete Pricebook System

## 📋 Context & Mission

You are building a **production-grade ServiceTitan Pricebook management system** from scratch. This is not a prototype or demo – this will be used daily by field service technicians and office staff at Perfect Catch, an electrical and pool service contracting business.

**Your Mission:** Build a complete React + TypeScript frontend that:
1. **Pixel-perfect replicates** ServiceTitan's Pricebook interface
2. **Integrates seamlessly** with existing backend API
3. **Handles all edge cases** (loading, errors, conflicts, empty states)
4. **Provides enhanced features** beyond ServiceTitan (vendor pricing, AI search, conflict resolution)

---

## 📚 Critical Documents (READ THESE FIRST)

Before writing any code, thoroughly read:

1. **API_REFERENCE.md** – Every endpoint, parameter, response format
2. **MASTER_DEPLOYMENT_GUIDE.md** – Overall architecture and phases
3. **SYNC_ENGINE_SPEC.md** – How bidirectional sync works
4. **VENDOR_INTEGRATION.md** – Vendor pricing flows
5. **Service_HTML** (uploaded file) – Exact UI structure to replicate

---

## 🎯 Core Principles (NON-NEGOTIABLE)

### 1. ServiceTitan API is Source of Truth
- All data operations go through our API (which proxies to ST)
- Never modify ST data structures
- Local enhancements (vendor pricing) stored separately

### 2. No Business Logic in Frontend
- UI renders data, triggers API calls
- All validation, transformation, sync logic in backend
- React components are "dumb" – just display and user interaction

### 3. Type Safety Everywhere
- Zero `any` types allowed
- Generate types from API responses
- Use Zod for runtime validation

### 4. Handle Every State
- Loading (skeletons, spinners)
- Error (user-friendly messages)
- Empty (helpful CTAs)
- Success (clear feedback)

### 5. Performance First
- Use TanStack Query for caching
- Optimize re-renders
- Lazy load routes
- Virtualize large tables

---

## 🛠️ Tech Stack (EXACTLY THIS)

```json
{
  "framework": "React 18",
  "language": "TypeScript 5+",
  "bundler": "Vite",
  "styling": "Tailwind CSS",
  "components": "shadcn/ui",
  "state": {
    "server": "TanStack Query (React Query)",
    "client": "Zustand"
  },
  "forms": "React Hook Form + Zod",
  "routing": "React Router v6",
  "tables": "TanStack Table",
  "icons": "Lucide React",
  "notifications": "Sonner"
}
```

---

## 📦 Project Setup (Phase 1 - Day 1, Hour 1)

### Step 1: Initialize Project

```bash
npm create vite@latest pricebook-ui -- --template react-ts
cd pricebook-ui
```

### Step 2: Install Dependencies

```bash
# Core
npm install react@18 react-dom@18 react-router-dom@6

# State & Data
npm install @tanstack/react-query @tanstack/react-query-devtools
npm install zustand
npm install axios

# Forms
npm install react-hook-form @hookform/resolvers zod

# UI
npm install tailwindcss postcss autoprefixer
npx tailwindcss init -p

npm install lucide-react
npm install sonner
npm install date-fns

# Tables
npm install @tanstack/react-table

# Dev Tools
npm install -D @types/node
```

### Step 3: Install shadcn/ui

```bash
npx shadcn-ui@latest init

# When prompted:
# - Style: Default
# - Base color: Slate
# - CSS variables: Yes

# Install essential components
npx shadcn-ui@latest add button
npx shadcn-ui@latest add input
npx shadcn-ui@latest add label
npx shadcn-ui@latest add select
npx shadcn-ui@latest add textarea
npx shadcn-ui@latest add form
npx shadcn-ui@latest add table
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add tabs
npx shadcn-ui@latest add card
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add separator
npx shadcn-ui@latest add skeleton
npx shadcn-ui@latest add toast
npx shadcn-ui@latest add alert
npx shadcn-ui@latest add command
```

### Step 4: Configure Tailwind (Extract ST Colors)

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ServiceTitan Brand Colors (extract from HTML)
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6', // Main blue
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        
        // Grays
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        },
        
        // Semantic
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6',
      },
      
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config
```

### Step 5: Project Structure

```
src/
├── components/
│   ├── ui/               # shadcn components (auto-generated)
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   ├── PageContainer.tsx
│   │   └── AppLayout.tsx
│   ├── services/
│   │   ├── ServiceListTable.tsx
│   │   ├── ServiceDetailForm.tsx
│   │   ├── ServiceMaterialsTable.tsx
│   │   └── ServiceEquipmentTable.tsx
│   ├── materials/
│   │   ├── MaterialListTable.tsx
│   │   ├── MaterialDetailForm.tsx
│   │   └── MaterialPriceHistory.tsx
│   ├── equipment/
│   │   └── EquipmentListTable.tsx
│   ├── categories/
│   │   └── CategoryPicker.tsx
│   └── common/
│       ├── LoadingSpinner.tsx
│       ├── EmptyState.tsx
│       └── ErrorBoundary.tsx
│
├── pages/
│   ├── Dashboard.tsx
│   ├── services/
│   │   ├── ServicesListPage.tsx
│   │   └── ServiceDetailPage.tsx
│   ├── materials/
│   │   ├── MaterialsListPage.tsx
│   │   └── MaterialDetailPage.tsx
│   ├── equipment/
│   │   └── EquipmentListPage.tsx
│   └── sync/
│       ├── SyncDashboard.tsx
│       └── ConflictResolution.tsx
│
├── lib/
│   ├── api.ts           # API client
│   ├── queryClient.ts   # React Query config
│   └── utils.ts         # Helper functions
│
├── hooks/
│   ├── useServices.ts
│   ├── useMaterials.ts
│   ├── useEquipment.ts
│   ├── useCategories.ts
│   └── useSync.ts
│
├── types/
│   ├── service.ts
│   ├── material.ts
│   ├── equipment.ts
│   └── sync.ts
│
├── schemas/
│   ├── serviceSchema.ts  # Zod schemas
│   ├── materialSchema.ts
│   └── equipmentSchema.ts
│
├── store/
│   └── userStore.ts     # Zustand store
│
├── App.tsx
├── main.tsx
└── index.css
```

---

## 🎨 Design System Implementation (Phase 2 - Day 1, Hours 2-4)

### Step 1: Analyze Service_HTML

**Your Task:** Extract from the uploaded `Service_HTML` file:

1. **Exact color hex codes** used for:
   - Primary actions (buttons)
   - Secondary actions
   - Text colors (headings, body, muted)
   - Borders
   - Backgrounds
   - Success/warning/error states

2. **Typography system**:
   - Font family (likely Inter or similar)
   - Heading sizes (h1, h2, h3)
   - Body text sizes
   - Label/caption sizes
   - Font weights used

3. **Spacing patterns**:
   - Container padding
   - Section margins
   - Form field spacing
   - Button padding
   - Card padding

4. **Component patterns**:
   - Button variants (primary, secondary, ghost)
   - Input field styles
   - Table styles
   - Card layouts
   - Modal/dialog patterns

### Step 2: Create Design Tokens

```typescript
// src/lib/design-tokens.ts

export const spacing = {
  xs: '0.25rem',  // 4px
  sm: '0.5rem',   // 8px
  md: '1rem',     // 16px
  lg: '1.5rem',   // 24px
  xl: '2rem',     // 32px
  '2xl': '3rem',  // 48px
}

export const fontSize = {
  xs: '0.75rem',    // 12px
  sm: '0.875rem',   // 14px
  base: '1rem',     // 16px
  lg: '1.125rem',   // 18px
  xl: '1.25rem',    // 20px
  '2xl': '1.5rem',  // 24px
  '3xl': '1.875rem', // 30px
}

export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
}

export const borderRadius = {
  sm: '0.25rem',   // 4px
  md: '0.375rem',  // 6px
  lg: '0.5rem',    // 8px
  xl: '0.75rem',   // 12px
  full: '9999px',
}

export const boxShadow = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
}
```

### Step 3: Create Layout Components

```typescript
// src/components/layout/PageContainer.tsx
export function PageContainer({ 
  children,
  className = '' 
}: { 
  children: React.ReactNode
  className?: string 
}) {
  return (
    <div className={cn(
      'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6',
      className
    )}>
      {children}
    </div>
  )
}

// src/components/layout/Card.tsx
export function Card({ 
  children,
  className = '' 
}: { 
  children: React.ReactNode
  className?: string 
}) {
  return (
    <div className={cn(
      'bg-white rounded-lg shadow-sm border border-gray-200 p-6',
      className
    )}>
      {children}
    </div>
  )
}
```

---

## 🔌 API Integration (Phase 3 - Day 1-2, Hours 5-10)

### Step 1: Create Type Definitions

```typescript
// src/types/service.ts

// Match EXACT structure from API_REFERENCE.md
export interface Service {
  id: number
  name: string
  displayName?: string
  code: string
  description?: string
  
  // Category
  categoryId?: number
  category?: Category
  
  // Pricing
  price: number
  memberPrice?: number
  addOnPrice?: number
  laborCost?: number
  
  // Duration
  hours?: number
  
  // Account
  accountId?: number
  
  // Materials & Equipment
  materials_included?: MaterialLink[]
  equipment_included?: EquipmentLink[]
  
  // Status
  isActive: boolean
  
  // ServiceTitan metadata
  modifiedOn: string
  createdOn?: string
  
  // Sync metadata (from our DB)
  sync_status?: 'synced' | 'pending_push' | 'pending_pull' | 'conflict'
  last_synced_at?: string
  has_conflict?: boolean
}

export interface MaterialLink {
  materialId: number
  quantity: number
  materialCode?: string
  materialName?: string
}

export interface EquipmentLink {
  equipmentId: number
  quantity: number
  equipmentCode?: string
  equipmentName?: string
}

export interface Category {
  id: number
  name: string
  parent_id?: number
  children?: Category[]
}

// API Response types
export interface ServicesResponse {
  data: Service[]
  page: number
  pageSize: number
  hasNext: boolean
  totalCount: number
}

// Create/Update DTOs
export interface CreateServiceDto {
  name: string
  code: string
  categoryId?: number
  price: number
  // ... all other fields
}

export interface UpdateServiceDto extends Partial<CreateServiceDto> {
  id: number
}
```

### Step 2: Create API Client

```typescript
// src/lib/api.ts
import axios, { AxiosInstance, AxiosError } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

class ApiClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Request interceptor (add auth token)
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('auth_token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    })

    // Response interceptor (handle errors)
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Handle unauthorized
          localStorage.removeItem('auth_token')
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }
    )
  }

  // Services
  async getServices(params?: GetServicesParams): Promise<ServicesResponse> {
    const { data } = await this.client.get('/pricebook/services', { params })
    return data
  }

  async getService(id: number): Promise<Service> {
    const { data } = await this.client.get(`/pricebook/services/${id}`)
    return data
  }

  async createService(dto: CreateServiceDto): Promise<Service> {
    const { data } = await this.client.post('/pricebook/services', dto)
    return data
  }

  async updateService(id: number, dto: UpdateServiceDto): Promise<Service> {
    const { data } = await this.client.patch(`/pricebook/services/${id}`, dto)
    return data
  }

  async deleteService(id: number): Promise<void> {
    await this.client.delete(`/pricebook/services/${id}`)
  }

  // Materials (similar pattern)
  async getMaterials(params?: GetMaterialsParams): Promise<MaterialsResponse> {
    const { data } = await this.client.get('/pricebook/materials', { params })
    return data
  }

  // ... all other endpoints from API_REFERENCE.md
}

export const api = new ApiClient()
```

### Step 3: Create React Query Hooks

```typescript
// src/hooks/useServices.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from 'sonner'

// Query keys (for cache management)
export const serviceKeys = {
  all: ['services'] as const,
  lists: () => [...serviceKeys.all, 'list'] as const,
  list: (params?: GetServicesParams) => [...serviceKeys.lists(), params] as const,
  details: () => [...serviceKeys.all, 'detail'] as const,
  detail: (id: number) => [...serviceKeys.details(), id] as const,
}

// List query
export function useServices(params?: GetServicesParams) {
  return useQuery({
    queryKey: serviceKeys.list(params),
    queryFn: () => api.getServices(params),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

// Detail query
export function useService(id: number) {
  return useQuery({
    queryKey: serviceKeys.detail(id),
    queryFn: () => api.getService(id),
    enabled: !!id, // Only run if id exists
  })
}

// Create mutation
export function useCreateService() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (dto: CreateServiceDto) => api.createService(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serviceKeys.lists() })
      toast.success('Service created successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create service')
    },
  })
}

// Update mutation
export function useUpdateService() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: UpdateServiceDto }) => 
      api.updateService(id, dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: serviceKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: serviceKeys.lists() })
      toast.success('Service updated successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update service')
    },
  })
}

// Delete mutation
export function useDeleteService() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => api.deleteService(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serviceKeys.all })
      toast.success('Service deleted successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete service')
    },
  })
}
```

---

## 📄 Core Pages Implementation (Phase 4 - Day 2-3)

### Services List Page

```typescript
// src/pages/services/ServicesListPage.tsx
import { useState } from 'react'
import { useServices } from '@/hooks/useServices'
import { ServiceListTable } from '@/components/services/ServiceListTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/components/layout/PageContainer'

export function ServicesListPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 50

  const { data, isLoading, error } = useServices({
    page,
    pageSize,
    search: search || undefined,
  })

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Services</h1>
        <Button>New Service</Button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <Input
          placeholder="Search services..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Table */}
      <ServiceListTable
        services={data?.data || []}
        isLoading={isLoading}
        error={error}
        page={page}
        pageSize={pageSize}
        totalCount={data?.totalCount || 0}
        onPageChange={setPage}
      />
    </PageContainer>
  )
}
```

### Service Detail Page

```typescript
// src/pages/services/ServiceDetailPage.tsx
import { useParams } from 'react-router-dom'
import { useService } from '@/hooks/useServices'
import { ServiceDetailForm } from '@/components/services/ServiceDetailForm'
import { ServiceMaterialsTable } from '@/components/services/ServiceMaterialsTable'
import { PageContainer } from '@/components/layout/PageContainer'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'

export function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const serviceId = parseInt(id!, 10)

  const { data: service, isLoading, error } = useService(serviceId)

  if (isLoading) return <LoadingSpinner />
  if (error) return <div>Error loading service</div>
  if (!service) return <div>Service not found</div>

  return (
    <PageContainer>
      {/* Breadcrumb */}
      <div className="mb-4 text-sm text-gray-500">
        <a href="/services" className="hover:text-gray-700">Services</a>
        {' / '}
        <span>{service.name}</span>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form - 2/3 width */}
        <div className="lg:col-span-2">
          <ServiceDetailForm service={service} />
        </div>

        {/* Sidebar - 1/3 width */}
        <div className="space-y-6">
          <ServiceMetadata service={service} />
          {service.has_conflict && (
            <ConflictAlert serviceId={service.id} />
          )}
        </div>
      </div>

      {/* Materials Table */}
      <div className="mt-6">
        <ServiceMaterialsTable 
          serviceId={serviceId}
          materials={service.materials_included || []}
        />
      </div>
    </PageContainer>
  )
}
```

---

## 🎯 Next Steps for Windsurf

Now that you have the complete context, here's what to build:

### Day 1 Tasks:
1. ✅ Project setup (Vite + React + TS + Tailwind)
2. ✅ Install all dependencies
3. ✅ Configure Tailwind with ST colors (extract from Service_HTML)
4. ✅ Create project structure
5. ✅ Setup React Query
6. ✅ Create API client
7. ✅ Create type definitions (from API_REFERENCE.md)

### Day 2 Tasks:
8. ✅ Create layout components (Header, Sidebar, PageContainer)
9. ✅ Build Services List page
10. ✅ Build Service Detail page
11. ✅ Create ServiceDetailForm component
12. ✅ Create ServiceMaterialsTable component

### Day 3 Tasks:
13. ✅ Build Materials List page
14. ✅ Build Material Detail page
15. ✅ Add loading/error/empty states everywhere
16. ✅ Test all CRUD operations

### Day 4 Tasks:
17. ✅ Build Sync Dashboard
18. ✅ Build Conflict Resolution UI
19. ✅ Add vendor pricing display
20. ✅ Polish UI (animations, transitions)

---

## 🚨 Critical Checkpoints

Before moving to next phase, verify:

- [ ] All API endpoints working (test in Postman first)
- [ ] Types match API responses exactly
- [ ] Loading states show for all async operations
- [ ] Error messages are user-friendly
- [ ] Forms validate correctly
- [ ] Tables support search/filter/pagination
- [ ] No console errors or warnings
- [ ] UI matches ServiceTitan 95%+

---

## 📚 Reference Materials

**Attach these files when prompting Windsurf:**

1. `API_REFERENCE.md` – Complete API documentation
2. `Service_HTML` – UI structure to replicate
3. `SYNC_ENGINE_SPEC.md` – Sync logic (for understanding conflict resolution UI)
4. `VENDOR_INTEGRATION.md` – Vendor pricing context

---

## ✅ Definition of Done

This project is complete when:

- [ ] All pages render without errors
- [ ] All CRUD operations work via API
- [ ] UI matches ServiceTitan design 95%+
- [ ] Forms have proper validation
- [ ] Tables support search, filter, sort, pagination
- [ ] Loading states everywhere
- [ ] Error handling everywhere
- [ ] Empty states with helpful CTAs
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] TypeScript has zero `any` types
- [ ] No console warnings or errors
- [ ] Code is organized and documented
- [ ] Can run `npm run build` successfully

---

**START HERE:**

"I have the complete documentation for a ServiceTitan Pricebook management system. Let's build the React + TypeScript frontend step-by-step, starting with project setup. I'll provide you with the API reference, UI structure, and all specifications. Ready to begin?"

Then paste this entire document + all reference files.

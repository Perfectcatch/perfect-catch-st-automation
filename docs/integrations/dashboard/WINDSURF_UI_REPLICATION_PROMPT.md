# Windsurf Prompt: ServiceTitan Pricebook UI Replication

## Context for AI Agent

You are helping build a **production-grade Pricebook management system** that replicates ServiceTitan's interface and functionality. This is **not a prototype** – this is a real business application that will be used daily by field service technicians and office staff.

---

## 🎯 Your Mission

Analyze the provided ServiceTitan HTML/screenshots and create a **pixel-perfect React + TypeScript application** that:

1. **Matches the visual design exactly** – Same colors, spacing, fonts, layouts
2. **Replicates all functionality** – Every button, dropdown, tab, and interaction
3. **Uses modern tech stack** – React 18, TypeScript, Tailwind CSS, Shadcn/UI
4. **Integrates with existing API** – All data operations via REST API (see API_REFERENCE.md)
5. **Handles edge cases** – Loading states, errors, empty states, validation

---

## 📦 Tech Stack (MANDATORY)

### Frontend Framework
```json
{
  "framework": "React 18+",
  "language": "TypeScript",
  "styling": "Tailwind CSS",
  "components": "shadcn/ui",
  "state": "Zustand (for global state)",
  "forms": "React Hook Form + Zod validation",
  "routing": "React Router v6",
  "api": "TanStack Query (React Query)"
}
```

### Why These Choices?
- **TypeScript:** Catch errors before runtime, better IDE support
- **Tailwind:** Same utility-first approach as ServiceTitan
- **shadcn/ui:** High-quality, accessible components (matches ST quality)
- **Zustand:** Simpler than Redux, perfect for this use case
- **React Hook Form:** Best performance for complex forms
- **TanStack Query:** Handles caching, refetching, error states automatically

---

## 🎨 Design System Extraction

### Step 1: Analyze Color Palette

From the ServiceTitan UI, extract:

```typescript
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        // Primary brand colors
        'st-blue': {
          50: '#eff6ff',
          500: '#3b82f6',  // Main blue
          600: '#2563eb',  // Hover state
        },
        // Neutrals
        'st-gray': {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          500: '#6b7280',
          700: '#374151',
          900: '#111827',
        },
        // Semantic colors
        'st-success': '#10b981',
        'st-warning': '#f59e0b',
        'st-error': '#ef4444',
      }
    }
  }
}
```

**Task:** Look at the HTML/screenshots and extract the EXACT hex codes used.

---

### Step 2: Typography System

```typescript
// fonts.ts
export const typography = {
  heading: {
    h1: 'text-3xl font-bold text-st-gray-900',
    h2: 'text-2xl font-semibold text-st-gray-900',
    h3: 'text-xl font-semibold text-st-gray-900',
  },
  body: {
    large: 'text-base text-st-gray-700',
    medium: 'text-sm text-st-gray-700',
    small: 'text-xs text-st-gray-500',
  },
  label: 'text-sm font-medium text-st-gray-700',
}
```

---

### Step 3: Spacing & Layout

```typescript
// Common patterns observed in ST
const layouts = {
  pageContainer: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6',
  card: 'bg-white rounded-lg shadow-sm border border-st-gray-200',
  formSection: 'space-y-4',
  buttonGroup: 'flex items-center gap-2',
}
```

---

## 🧩 Component Architecture

### Page Structure (Standard Pattern)

```typescript
// src/pages/ServiceDetailPage.tsx
import { ServiceDetailHeader } from '@/components/services/ServiceDetailHeader'
import { ServiceDetailForm } from '@/components/services/ServiceDetailForm'
import { MaterialsTable } from '@/components/materials/MaterialsTable'
import { EquipmentTable } from '@/components/equipment/EquipmentTable'

export function ServiceDetailPage() {
  const { serviceId } = useParams()
  const { data: service, isLoading } = useService(serviceId)

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="page-container">
      <ServiceDetailHeader service={service} />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Main form - 2/3 width */}
        <div className="lg:col-span-2">
          <ServiceDetailForm service={service} />
        </div>
        
        {/* Sidebar - 1/3 width */}
        <div className="space-y-6">
          <ServiceMetadata service={service} />
          <ServiceHistory service={service} />
        </div>
      </div>

      {/* Full-width materials table */}
      <div className="mt-6">
        <MaterialsTable serviceId={serviceId} />
      </div>

      {/* Full-width equipment table */}
      <div className="mt-6">
        <EquipmentTable serviceId={serviceId} />
      </div>
    </div>
  )
}
```

---

### Form Component Pattern

```typescript
// src/components/services/ServiceDetailForm.tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { serviceSchema } from '@/schemas/service'
import { useUpdateService } from '@/hooks/useServices'

export function ServiceDetailForm({ service }: Props) {
  const form = useForm({
    resolver: zodResolver(serviceSchema),
    defaultValues: service,
  })

  const updateService = useUpdateService()

  const onSubmit = async (data: ServiceFormData) => {
    try {
      await updateService.mutateAsync({ id: service.id, data })
      toast.success('Service updated successfully')
    } catch (error) {
      toast.error('Failed to update service')
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="card p-6">
      <div className="form-section">
        <FormField
          label="Service Name"
          error={form.formState.errors.name?.message}
        >
          <Input {...form.register('name')} />
        </FormField>

        <FormField label="Category">
          <CategorySelect
            value={form.watch('categoryId')}
            onChange={(id) => form.setValue('categoryId', id)}
          />
        </FormField>

        {/* More fields... */}
      </div>

      <div className="button-group justify-end mt-6">
        <Button variant="outline" onClick={() => form.reset()}>
          Cancel
        </Button>
        <Button type="submit" loading={updateService.isLoading}>
          Save Changes
        </Button>
      </div>
    </form>
  )
}
```

---

### Table Component Pattern

```typescript
// src/components/materials/MaterialsTable.tsx
import { useServiceMaterials } from '@/hooks/useMaterials'
import { DataTable } from '@/components/ui/DataTable'
import { materialColumns } from './columns'

export function MaterialsTable({ serviceId }: Props) {
  const { data, isLoading } = useServiceMaterials(serviceId)

  return (
    <div className="card">
      <div className="p-6 border-b">
        <h3 className="text-xl font-semibold">Materials Included</h3>
      </div>
      
      <DataTable
        columns={materialColumns}
        data={data?.materials || []}
        loading={isLoading}
        emptyState={
          <div className="text-center py-12">
            <p className="text-st-gray-500">No materials added yet</p>
            <Button className="mt-4">Add Material</Button>
          </div>
        }
      />
    </div>
  )
}
```

---

## 🔌 API Integration Pattern

### Setup TanStack Query

```typescript
// src/lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
```

### Create API Client

```typescript
// src/lib/api.ts
const API_BASE = import.meta.env.VITE_API_BASE_URL

class ApiClient {
  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthToken()}`,
        ...options?.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new ApiError(error.message, response.status)
    }

    return response.json()
  }

  // Services
  async getServices(params: GetServicesParams) {
    return this.request<ServicesResponse>('/pricebook/services', {
      method: 'GET',
      // Add query params
    })
  }

  async getService(id: number) {
    return this.request<Service>(`/pricebook/services/${id}`)
  }

  async createService(data: CreateServiceDto) {
    return this.request<Service>('/pricebook/services', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // ... more methods
}

export const api = new ApiClient()
```

### Create React Query Hooks

```typescript
// src/hooks/useServices.ts
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'

export function useServices(params?: GetServicesParams) {
  return useQuery({
    queryKey: ['services', params],
    queryFn: () => api.getServices(params),
  })
}

export function useService(id: number) {
  return useQuery({
    queryKey: ['services', id],
    queryFn: () => api.getService(id),
    enabled: !!id,
  })
}

export function useCreateService() {
  return useMutation({
    mutationFn: api.createService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      toast.success('Service created')
    },
  })
}

export function useUpdateService() {
  return useMutation({
    mutationFn: ({ id, data }: UpdateServiceParams) =>
      api.updateService(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['services', data.id] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
      toast.success('Service updated')
    },
  })
}
```

---

## 🎯 Key UI Components to Replicate

### 1. Header (Top Navigation)

**From ServiceTitan:**
- Logo on left
- Main nav tabs (Pricebook, Jobs, Customers, etc.)
- Search bar in center
- User profile + notifications on right

**Your Implementation:**
```typescript
<header className="bg-white border-b border-st-gray-200">
  <div className="max-w-7xl mx-auto px-4">
    <div className="flex items-center justify-between h-16">
      <Logo />
      <MainNav />
      <GlobalSearch />
      <UserMenu />
    </div>
  </div>
</header>
```

---

### 2. Service Detail Form

**Required Fields:**
- Service Name (text input)
- Category (hierarchical select)
- Display Name (text input)
- Description (textarea)
- Duration (number input with unit)
- Price (currency input)
- Labor Cost (currency input)
- Account (dropdown)
- Is Active (toggle)

**Special Features:**
- **Category Select:** Must show nested categories (e.g. "Electrical > Outlets > Installation")
- **Price Calculator:** Auto-calculate markup % when price or cost changes
- **Materials Bundling:** Inline table to add/remove materials
- **Equipment Bundling:** Inline table to add/remove equipment

---

### 3. Materials Table

**Columns:**
- Material Name (with image thumbnail)
- Code
- Quantity
- Unit Cost
- Extended Cost (quantity × cost)
- Vendor
- Actions (Edit, Remove)

**Features:**
- **Inline Editing:** Click to edit quantity
- **Search/Filter:** Search across all columns
- **Bulk Actions:** Select multiple → Delete
- **Drag to Reorder:** Change material order

---

### 4. Category Hierarchy Selector

**UI Pattern:**
```typescript
// Breadcrumb-style selector
<CategoryPicker>
  <CategoryLevel>
    {/* Root categories */}
    <CategoryOption>Electrical</CategoryOption>
    <CategoryOption>Plumbing</CategoryOption>
    <CategoryOption>Pool</CategoryOption>
  </CategoryLevel>
  
  {selectedRoot && (
    <CategoryLevel>
      {/* Child categories */}
      <CategoryOption>Outlets</CategoryOption>
      <CategoryOption>Lighting</CategoryOption>
    </CategoryLevel>
  )}
  
  {selectedChild && (
    <CategoryLevel>
      {/* Grandchild categories */}
      <CategoryOption>Installation</CategoryOption>
      <CategoryOption>Repair</CategoryOption>
    </CategoryLevel>
  )}
</CategoryPicker>
```

---

## 📋 Step-by-Step Implementation Plan

### Phase 1: Project Setup (30 minutes)

```bash
# Initialize Vite + React + TypeScript
npm create vite@latest pricebook-ui -- --template react-ts
cd pricebook-ui

# Install dependencies
npm install tailwindcss postcss autoprefixer
npm install @tanstack/react-query
npm install react-router-dom
npm install react-hook-form zod @hookform/resolvers/zod
npm install zustand
npm install lucide-react  # Icons
npm install sonner         # Toast notifications

# Setup Tailwind
npx tailwindcss init -p

# Install shadcn/ui
npx shadcn-ui@latest init
npx shadcn-ui@latest add button input label select textarea
npx shadcn-ui@latest add form table dropdown-menu dialog
```

### Phase 2: Design System (1 hour)

1. Configure `tailwind.config.ts` with ST color palette
2. Create reusable layout components (`PageContainer`, `Card`, `Section`)
3. Create form components (`FormField`, `FormLabel`, `FormError`)
4. Create base UI components (if not in shadcn)

### Phase 3: Routing & Layout (30 minutes)

```typescript
// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/services" element={<ServicesListPage />} />
          <Route path="/services/:id" element={<ServiceDetailPage />} />
          <Route path="/materials" element={<MaterialsListPage />} />
          <Route path="/materials/:id" element={<MaterialDetailPage />} />
          <Route path="/equipment" element={<EquipmentListPage />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  )
}
```

### Phase 4: API Integration (2 hours)

1. Create API client (`src/lib/api.ts`)
2. Create React Query hooks for each endpoint
3. Setup error handling and retry logic
4. Test with real API endpoints

### Phase 5: Build Core Pages (8 hours)

#### Services List Page (2 hours)
- Search bar
- Filter dropdowns (category, active status)
- Data table with pagination
- "New Service" button → modal

#### Service Detail Page (4 hours)
- Header with breadcrumb
- Main form (all fields)
- Materials table with add/remove
- Equipment table with add/remove
- Save/Cancel buttons

#### Materials List Page (2 hours)
- Similar to Services, simpler form

### Phase 6: Polish & Edge Cases (2 hours)

1. Loading states (skeletons)
2. Empty states (no data messages)
3. Error states (network failures, validation)
4. Success toasts
5. Confirm dialogs (delete actions)

---

## 🚨 Common Pitfalls to Avoid

### 1. Don't Build ServiceTitan from Scratch
**Wrong:** "Let me rebuild the entire platform"
**Right:** "Let me build the Pricebook module that talks to our API"

### 2. Don't Ignore the API Contract
**Wrong:** Create your own data structures
**Right:** Use EXACT types from `API_REFERENCE.md`

### 3. Don't Over-Engineer
**Wrong:** Redux + Sagas + Thunks
**Right:** Zustand for global state, React Query for server state

### 4. Don't Forget Loading/Error States
**Wrong:** Only show success case
**Right:** Handle all states (loading, error, empty, success)

---

## 🎬 Getting Started (Copy This Prompt to Windsurf)

```
I have this HTML document from a ServiceTitan-like application.

Please:
1. Analyze the structure and extract the design system (colors, fonts, spacing)
2. Create a modern React + TypeScript application that replicates this interface exactly
3. Use Tailwind CSS for styling with the extracted color palette
4. Use shadcn/ui for base components
5. Make all components functional with proper state management (Zustand + React Query)
6. Create API integration using the endpoints from API_REFERENCE.md
7. Add TypeScript types for all data structures
8. Handle loading, error, and empty states

Start with:
1. Project setup (Vite + React + TS + Tailwind)
2. Design system configuration (colors, typography)
3. Header component (top navigation)
4. Service detail page (main form + materials table)

For the Service detail page, replicate:
- All form fields exactly as shown
- The materials table with inline editing
- The equipment table
- Save/Cancel button behavior
- Validation rules

Here is the HTML to analyze:
[Paste the Service_HTML content]

And here is the API reference for integration:
[Paste API_REFERENCE.md content]

Let's build this step-by-step, starting with the project setup.
```

---

## 📚 Reference Files to Provide

1. **API_REFERENCE.md** – Endpoint specs
2. **Service_HTML** – UI structure to replicate
3. **MASTER_DEPLOYMENT_GUIDE.md** – Overall context
4. **ServiceTitan screenshots** (if available)

---

## ✅ Success Criteria

Your implementation is complete when:

- [ ] Visual design matches ST 95%+ (colors, spacing, fonts)
- [ ] All CRUD operations work via API
- [ ] Forms validate correctly (required fields, format)
- [ ] Tables support search, filter, pagination
- [ ] Loading states show for all async operations
- [ ] Error messages are user-friendly
- [ ] No console errors or warnings
- [ ] TypeScript has zero `any` types
- [ ] Code is organized (components, hooks, utils)
- [ ] Can run `npm run build` without errors

---

*Use this prompt with Windsurf to build a production-ready Pricebook UI in 1-2 days.*

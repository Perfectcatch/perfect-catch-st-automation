/**
 * Pricebook Chat Agent
 * Main orchestrator for conversational AI pricebook management
 * 
 * Supports natural language operations:
 * - Query materials, services, equipment by category
 * - Create new pricebook items
 * - Update existing items
 * - Interactive validation (asks for missing fields)
 */

import { createLogger } from '../lib/logger.js';
import { IntentClassifier } from './intent-classifier.js';
import { EntityExtractor } from './entity-extractor.js';
import { ValidationHandler } from './validation-handler.js';
import { ContextManager } from './context-manager.js';
import config from '../config/index.js';

const logger = createLogger('pricebook-chat');

export class PricebookChatAgent {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {Object} stClient - ServiceTitan API client
   * @param {string} openaiApiKey
   */
  constructor(prisma, stClient, openaiApiKey) {
    this.prisma = prisma;
    this.stClient = stClient;
    this.tenantId = config.serviceTitan.tenantId;

    // Initialize components
    this.intentClassifier = new IntentClassifier(openaiApiKey);
    this.entityExtractor = new EntityExtractor(openaiApiKey);
    this.validationHandler = new ValidationHandler();
    this.contextManager = new ContextManager(prisma);

    this.logger = logger;
  }

  /**
   * Process a chat message
   * @param {string} sessionId - Unique session identifier
   * @param {string} message - User message
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Response with message and metadata
   */
  async processMessage(sessionId, message, options = {}) {
    this.logger.info({ sessionId, message: message.substring(0, 100) }, 'Processing message');

    try {
      // Get or create conversation context
      const context = await this.contextManager.getContext(sessionId);

      // Add user message to history
      context.history.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      });

      let response;

      // Check if we're waiting for missing fields
      if (context.pendingAction?.missingFields?.length > 0) {
        response = await this.handlePendingAction(context, message);
      } else {
        // Classify intent and route to handler
        const intent = await this.intentClassifier.classify(message, context);
        this.logger.info({ sessionId, intent }, 'Intent classified');

        response = await this.routeToHandler(intent, context, message);
      }

      // Add assistant response to history
      context.history.push({
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
      });

      // Save context
      await this.contextManager.saveContext(sessionId, context);

      return {
        success: true,
        message: response.message,
        data: response.data || null,
        suggestions: response.suggestions || [],
        context: {
          lastCategory: context.lastCategory,
          hasPendingAction: !!context.pendingAction,
        },
      };
    } catch (error) {
      this.logger.error({ sessionId, error: error.message }, 'Error processing message');

      return {
        success: false,
        message: "I encountered an error processing your request. Please try again.",
        error: error.message,
      };
    }
  }

  /**
   * Route intent to appropriate handler
   * @param {Object} intent
   * @param {Object} context
   * @param {string} message
   * @returns {Promise<Object>}
   */
  async routeToHandler(intent, context, message) {
    switch (intent.type) {
      case 'query_materials':
        return this.handleQueryMaterials(context, message, intent.entities);

      case 'query_services':
        return this.handleQueryServices(context, message, intent.entities);

      case 'query_equipment':
        return this.handleQueryEquipment(context, message, intent.entities);

      case 'query_categories':
        return this.handleQueryCategories(context, message);

      case 'create_material':
      case 'create_multiple_materials':
        return this.handleCreateMaterials(context, message, intent.entities);

      case 'create_service':
        return this.handleCreateService(context, message, intent.entities);

      case 'update_material':
        return this.handleUpdateMaterial(context, message, intent.entities);

      case 'search_pricebook':
        return this.handleSearch(context, message, intent.entities);

      case 'help':
        return this.handleHelp();

      default:
        return this.handleUnknown(context, message);
    }
  }

  /**
   * Handle pending action (waiting for missing fields)
   * @param {Object} context
   * @param {string} message
   * @returns {Promise<Object>}
   */
  async handlePendingAction(context, message) {
    const { pendingAction } = context;

    // Extract field values from message
    const extractedValues = await this.entityExtractor.extractFieldValues(
      message,
      pendingAction.missingFields
    );

    // Update pending data with extracted values
    if (pendingAction.type === 'create_material' || pendingAction.type === 'create_multiple_materials') {
      for (const material of pendingAction.data.materials) {
        Object.assign(material, extractedValues);
      }
    } else if (pendingAction.type === 'create_service') {
      Object.assign(pendingAction.data.service, extractedValues);
    }

    // Re-validate
    const validation = this.validationHandler.validateMaterial(pendingAction.data.materials[0]);

    if (validation.missingFields.length > 0) {
      // Still missing fields
      pendingAction.missingFields = validation.missingFields;
      
      return {
        message: `Thanks! I still need:\n${this.formatMissingFields(validation.missingFields)}`,
        data: { pendingAction },
      };
    }

    // All fields present - execute the action
    return this.executePendingAction(context);
  }

  /**
   * Execute a pending action after all fields are collected
   * @param {Object} context
   * @returns {Promise<Object>}
   */
  async executePendingAction(context) {
    const { pendingAction } = context;

    try {
      if (pendingAction.type === 'create_material' || pendingAction.type === 'create_multiple_materials') {
        const created = await this.createMaterialsInST(pendingAction.data.materials);
        
        // Clear pending action
        context.pendingAction = null;

        return {
          message: `✅ Created ${created.length} material(s):\n\n${created.map((m, i) => 
            `${i + 1}. **${m.name}** (${m.code}) - ST ID: ${m.id}`
          ).join('\n')}\n\nWhat else can I help you with?`,
          data: { created },
        };
      }

      if (pendingAction.type === 'create_service') {
        const created = await this.createServiceInST(pendingAction.data.service);
        
        context.pendingAction = null;

        return {
          message: `✅ Created service: **${created.name}** (${created.code}) - ST ID: ${created.id}\n\nWhat else can I help you with?`,
          data: { created },
        };
      }

      context.pendingAction = null;
      return { message: "Action completed." };
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to execute pending action');
      context.pendingAction = null;
      
      return {
        message: `❌ Failed to complete the action: ${error.message}\n\nPlease try again.`,
      };
    }
  }

  /**
   * Handle query materials intent
   */
  async handleQueryMaterials(context, message, entities) {
    // Extract category from message or use context
    let categoryName = entities?.category || await this.entityExtractor.extractCategoryName(message);

    if (!categoryName && context.lastCategory) {
      categoryName = context.lastCategory.name;
    }

    if (!categoryName) {
      return {
        message: "Which category would you like to see materials for?\n\nFor example: *conduit*, *wire*, *breakers*, *fittings*",
        suggestions: ['Show conduit materials', 'List wire materials', 'Show all categories'],
      };
    }

    // Find category
    const category = await this.prisma.pricebookCategory.findFirst({
      where: {
        name: { contains: categoryName, mode: 'insensitive' },
        active: true,
        deletedAt: null,
      },
    });

    if (!category) {
      return {
        message: `I couldn't find a category matching "${categoryName}".\n\nWould you like me to list all available categories?`,
        suggestions: ['Show all categories', `Search for ${categoryName}`],
      };
    }

    // Save to context
    context.lastCategory = {
      id: category.id,
      name: category.name,
      stId: category.stId.toString(),
    };

    // Get materials
    const materials = await this.prisma.pricebookMaterial.findMany({
      where: {
        categoryId: category.stId,
        active: true,
        deletedAt: null,
      },
      orderBy: { name: 'asc' },
      take: 25,
    });

    if (materials.length === 0) {
      return {
        message: `The **${category.name}** category has no materials yet.\n\nWould you like to add some?`,
        suggestions: [`Create material in ${category.name}`, 'Show all categories'],
        data: { category, materials: [] },
      };
    }

    const materialList = materials
      .map((m, i) => `${i + 1}. **${m.name}** (${m.code}) - $${m.price?.toFixed(2) || 'N/A'}`)
      .join('\n');

    const totalCount = await this.prisma.pricebookMaterial.count({
      where: { categoryId: category.stId, active: true, deletedAt: null },
    });

    return {
      message: `Found **${totalCount}** materials in **${category.name}**:\n\n${materialList}${totalCount > 25 ? `\n\n_Showing first 25 of ${totalCount}_` : ''}\n\nWould you like to add more materials to this category?`,
      suggestions: [`Create material in ${category.name}`, 'Show more', 'Search materials'],
      data: { category, materials, totalCount },
    };
  }

  /**
   * Handle query services intent
   */
  async handleQueryServices(context, message, entities) {
    let categoryName = entities?.category || await this.entityExtractor.extractCategoryName(message);

    if (!categoryName && context.lastCategory) {
      categoryName = context.lastCategory.name;
    }

    if (!categoryName) {
      // Show all services
      const services = await this.prisma.pricebookService.findMany({
        where: { active: true, deletedAt: null },
        orderBy: { name: 'asc' },
        take: 25,
      });

      if (services.length === 0) {
        return { message: "No services found in the pricebook." };
      }

      const serviceList = services
        .map((s, i) => `${i + 1}. **${s.name}** (${s.code}) - $${s.price?.toFixed(2) || 'N/A'}`)
        .join('\n');

      return {
        message: `Found **${services.length}** services:\n\n${serviceList}`,
        data: { services },
      };
    }

    // Find by category
    const category = await this.prisma.pricebookCategory.findFirst({
      where: { name: { contains: categoryName, mode: 'insensitive' }, active: true },
    });

    if (!category) {
      return { message: `Category "${categoryName}" not found.` };
    }

    context.lastCategory = { id: category.id, name: category.name, stId: category.stId.toString() };

    const services = await this.prisma.pricebookService.findMany({
      where: { categoryId: category.stId, active: true, deletedAt: null },
      orderBy: { name: 'asc' },
      take: 25,
    });

    if (services.length === 0) {
      return { message: `No services found in **${category.name}**.` };
    }

    const serviceList = services
      .map((s, i) => `${i + 1}. **${s.name}** (${s.code}) - $${s.price?.toFixed(2) || 'N/A'}`)
      .join('\n');

    return {
      message: `Found **${services.length}** services in **${category.name}**:\n\n${serviceList}`,
      data: { category, services },
    };
  }

  /**
   * Handle query equipment intent
   */
  async handleQueryEquipment(context, message, entities) {
    let categoryName = entities?.category || await this.entityExtractor.extractCategoryName(message);

    const where = { active: true, deletedAt: null };

    if (categoryName) {
      const category = await this.prisma.pricebookCategory.findFirst({
        where: { name: { contains: categoryName, mode: 'insensitive' }, active: true },
      });

      if (category) {
        where.categoryId = category.stId;
        context.lastCategory = { id: category.id, name: category.name, stId: category.stId.toString() };
      }
    }

    const equipment = await this.prisma.pricebookEquipment.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 25,
    });

    if (equipment.length === 0) {
      return { message: "No equipment found." };
    }

    const equipmentList = equipment
      .map((e, i) => `${i + 1}. **${e.name}** (${e.code}) - $${e.price?.toFixed(2) || 'N/A'}`)
      .join('\n');

    return {
      message: `Found **${equipment.length}** equipment items:\n\n${equipmentList}`,
      data: { equipment },
    };
  }

  /**
   * Handle query categories intent
   */
  async handleQueryCategories(context, message) {
    const categories = await this.prisma.pricebookCategory.findMany({
      where: { active: true, deletedAt: null, parentId: null },
      orderBy: { name: 'asc' },
    });

    if (categories.length === 0) {
      return { message: "No categories found. Run a sync to populate the pricebook." };
    }

    const categoryList = categories
      .map((c, i) => `${i + 1}. **${c.name}** (${c.code || 'no code'})`)
      .join('\n');

    return {
      message: `Found **${categories.length}** top-level categories:\n\n${categoryList}\n\nWhich category would you like to explore?`,
      suggestions: categories.slice(0, 5).map(c => `Show ${c.name} materials`),
      data: { categories },
    };
  }

  /**
   * Handle create materials intent
   */
  async handleCreateMaterials(context, message, entities) {
    // Extract materials from message
    const extractedMaterials = await this.entityExtractor.extractMaterials(message);

    if (extractedMaterials.length === 0) {
      return {
        message: "I couldn't identify any materials to create.\n\nTry something like: *Create 1-inch 90-degree elbows and tees*",
        suggestions: ['Create 1-inch 90s', 'Create copper fittings', 'Create PVC pipes'],
      };
    }

    // Check for category
    if (!context.lastCategory) {
      const categoryName = await this.entityExtractor.extractCategoryName(message);
      
      if (categoryName) {
        const category = await this.prisma.pricebookCategory.findFirst({
          where: { name: { contains: categoryName, mode: 'insensitive' }, active: true },
        });

        if (category) {
          context.lastCategory = { id: category.id, name: category.name, stId: category.stId.toString() };
        }
      }
    }

    if (!context.lastCategory) {
      return {
        message: `I found ${extractedMaterials.length} material(s) to create:\n\n${extractedMaterials.map((m, i) => `${i + 1}. ${m.name}`).join('\n')}\n\nWhich category should I add them to?`,
        suggestions: ['Conduit', 'Wire', 'Fittings', 'Show categories'],
      };
    }

    // Build materials with category
    const materialsToCreate = extractedMaterials.map(m => ({
      categoryId: parseInt(context.lastCategory.stId, 10),
      name: m.name,
      code: this.generateCode(m.name),
      description: m.description || '',
      unitOfMeasure: m.unitOfMeasure || 'Each',
      ...m,
    }));

    // Validate
    const validation = this.validationHandler.validateMaterial(materialsToCreate[0]);

    if (validation.missingFields.length > 0) {
      // Store pending action
      context.pendingAction = {
        type: extractedMaterials.length > 1 ? 'create_multiple_materials' : 'create_material',
        data: { materials: materialsToCreate },
        missingFields: validation.missingFields,
      };

      return {
        message: `Great! I'll create **${materialsToCreate.length}** material(s) in **${context.lastCategory.name}**:\n\n${materialsToCreate.map((m, i) => `${i + 1}. ${m.name}`).join('\n')}\n\nTo complete this, I need:\n${this.formatMissingFields(validation.missingFields)}`,
        data: { pendingAction: context.pendingAction },
      };
    }

    // All fields present - create immediately
    const created = await this.createMaterialsInST(materialsToCreate);

    return {
      message: `✅ Created ${created.length} material(s):\n\n${created.map((m, i) => 
        `${i + 1}. **${m.name}** (${m.code}) - ST ID: ${m.id}`
      ).join('\n')}`,
      data: { created },
    };
  }

  /**
   * Handle create service intent
   */
  async handleCreateService(context, message, entities) {
    const extractedService = await this.entityExtractor.extractService(message);

    if (!extractedService) {
      return {
        message: "I couldn't identify a service to create.\n\nTry: *Create a service called Panel Upgrade for $2500*",
      };
    }

    if (!context.lastCategory) {
      return {
        message: `I'll create the service: **${extractedService.name}**\n\nWhich category should it be in?`,
      };
    }

    const serviceToCreate = {
      categoryId: parseInt(context.lastCategory.stId, 10),
      ...extractedService,
      code: extractedService.code || this.generateCode(extractedService.name),
    };

    const validation = this.validationHandler.validateService(serviceToCreate);

    if (validation.missingFields.length > 0) {
      context.pendingAction = {
        type: 'create_service',
        data: { service: serviceToCreate },
        missingFields: validation.missingFields,
      };

      return {
        message: `I'll create the service **${serviceToCreate.name}** in **${context.lastCategory.name}**.\n\nI need:\n${this.formatMissingFields(validation.missingFields)}`,
      };
    }

    const created = await this.createServiceInST(serviceToCreate);

    return {
      message: `✅ Created service: **${created.name}** - ST ID: ${created.id}`,
      data: { created },
    };
  }

  /**
   * Handle update material intent
   */
  async handleUpdateMaterial(context, message, entities) {
    const materialName = entities?.materialName || await this.entityExtractor.extractMaterialName(message);

    if (!materialName) {
      return {
        message: "Which material would you like to update?\n\nTry: *Update the price of 1-inch EMT to $5.99*",
      };
    }

    // Find material
    const material = await this.prisma.pricebookMaterial.findFirst({
      where: {
        name: { contains: materialName, mode: 'insensitive' },
        active: true,
        deletedAt: null,
      },
    });

    if (!material) {
      return {
        message: `I couldn't find a material matching "${materialName}".\n\nTry searching or listing materials first.`,
      };
    }

    // Extract update values
    const updates = await this.entityExtractor.extractFieldValues(message, ['price', 'cost', 'name', 'description']);

    if (Object.keys(updates).length === 0) {
      return {
        message: `Found **${material.name}** (${material.code})\n\nCurrent price: $${material.price?.toFixed(2) || 'N/A'}\n\nWhat would you like to change?`,
        suggestions: ['Update price to $X', 'Update cost to $X', 'Change description'],
      };
    }

    // Update in ST and local
    const updated = await this.updateMaterialInST(material.stId.toString(), updates);

    return {
      message: `✅ Updated **${material.name}**:\n${Object.entries(updates).map(([k, v]) => `• ${k}: ${v}`).join('\n')}`,
      data: { updated },
    };
  }

  /**
   * Handle search intent
   */
  async handleSearch(context, message, entities) {
    const searchTerm = entities?.searchTerm || message.replace(/search|find|look for/gi, '').trim();

    if (!searchTerm) {
      return { message: "What would you like to search for?" };
    }

    // Search across materials, services, equipment
    const [materials, services, equipment] = await Promise.all([
      this.prisma.pricebookMaterial.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { code: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
          ],
          active: true,
          deletedAt: null,
        },
        take: 10,
      }),
      this.prisma.pricebookService.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { code: { contains: searchTerm, mode: 'insensitive' } },
          ],
          active: true,
          deletedAt: null,
        },
        take: 5,
      }),
      this.prisma.pricebookEquipment.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { code: { contains: searchTerm, mode: 'insensitive' } },
          ],
          active: true,
          deletedAt: null,
        },
        take: 5,
      }),
    ]);

    const totalResults = materials.length + services.length + equipment.length;

    if (totalResults === 0) {
      return {
        message: `No results found for "${searchTerm}".\n\nTry a different search term or browse by category.`,
        suggestions: ['Show categories', 'List all materials'],
      };
    }

    let response = `Found **${totalResults}** results for "${searchTerm}":\n\n`;

    if (materials.length > 0) {
      response += `**Materials (${materials.length}):**\n`;
      response += materials.map(m => `• ${m.name} (${m.code}) - $${m.price?.toFixed(2) || 'N/A'}`).join('\n');
      response += '\n\n';
    }

    if (services.length > 0) {
      response += `**Services (${services.length}):**\n`;
      response += services.map(s => `• ${s.name} (${s.code}) - $${s.price?.toFixed(2) || 'N/A'}`).join('\n');
      response += '\n\n';
    }

    if (equipment.length > 0) {
      response += `**Equipment (${equipment.length}):**\n`;
      response += equipment.map(e => `• ${e.name} (${e.code}) - $${e.price?.toFixed(2) || 'N/A'}`).join('\n');
    }

    return {
      message: response,
      data: { materials, services, equipment },
    };
  }

  /**
   * Handle help intent
   */
  handleHelp() {
    return {
      message: `# Pricebook Chat Assistant

I can help you manage your ServiceTitan pricebook. Here's what I can do:

**📋 Browse & Search**
• "Show me conduit materials"
• "List all categories"
• "Search for EMT"

**➕ Create Items**
• "Create 1-inch 90s and tees"
• "Add a new service called Panel Upgrade"

**✏️ Update Items**
• "Update the price of 1-inch EMT to $5.99"

**💡 Tips**
• I remember your last category, so you can say "add more materials" after browsing
• I'll ask for missing information like price and cost

What would you like to do?`,
      suggestions: ['Show categories', 'Search materials', 'Create a material'],
    };
  }

  /**
   * Handle unknown intent
   */
  handleUnknown(context, message) {
    return {
      message: "I'm not sure what you'd like to do. Try asking me to:\n\n• Show materials in a category\n• Create new materials\n• Search the pricebook\n• List categories\n\nOr say **help** for more options.",
      suggestions: ['Help', 'Show categories', 'Search materials'],
    };
  }

  /**
   * Create materials in ServiceTitan
   */
  async createMaterialsInST(materials) {
    const created = [];

    for (const material of materials) {
      try {
        const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/materials`;
        
        const response = await this.stClient.stRequest(url, {
          method: 'POST',
          body: {
            code: material.code,
            displayName: material.name,
            description: material.description || '',
            price: material.price,
            cost: material.cost,
            unitOfMeasure: material.unitOfMeasure || 'Each',
            active: true,
            categoryId: material.categoryId,
          },
        });

        if (response.ok) {
          // Save to local DB
          await this.prisma.pricebookMaterial.create({
            data: {
              stId: BigInt(response.data.id),
              tenantId: BigInt(this.tenantId),
              categoryId: BigInt(material.categoryId),
              code: material.code,
              name: material.name,
              description: material.description || '',
              price: material.price,
              cost: material.cost,
              unitOfMeasure: material.unitOfMeasure || 'Each',
              active: true,
              lastSyncedAt: new Date(),
              syncStatus: 'synced',
              syncDirection: 'to_st',
            },
          });

          created.push({ ...response.data, name: material.name, code: material.code });
        } else {
          this.logger.error({ material: material.name, response: response.data }, 'Failed to create material in ST');
        }
      } catch (error) {
        this.logger.error({ material: material.name, error: error.message }, 'Error creating material');
      }
    }

    return created;
  }

  /**
   * Create service in ServiceTitan
   */
  async createServiceInST(service) {
    const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/services`;
    
    const response = await this.stClient.stRequest(url, {
      method: 'POST',
      body: {
        code: service.code,
        displayName: service.name,
        description: service.description || '',
        price: service.price,
        active: true,
        categoryId: service.categoryId,
      },
    });

    if (response.ok) {
      await this.prisma.pricebookService.create({
        data: {
          stId: BigInt(response.data.id),
          tenantId: BigInt(this.tenantId),
          categoryId: BigInt(service.categoryId),
          code: service.code,
          name: service.name,
          description: service.description || '',
          price: service.price,
          active: true,
          lastSyncedAt: new Date(),
          syncStatus: 'synced',
          syncDirection: 'to_st',
        },
      });

      return { ...response.data, name: service.name, code: service.code };
    }

    throw new Error(`Failed to create service: ${JSON.stringify(response.data)}`);
  }

  /**
   * Update material in ServiceTitan
   */
  async updateMaterialInST(stId, updates) {
    const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/materials/${stId}`;
    
    const response = await this.stClient.stRequest(url, {
      method: 'PATCH',
      body: updates,
    });

    if (response.ok) {
      await this.prisma.pricebookMaterial.update({
        where: { stId: BigInt(stId) },
        data: {
          ...updates,
          lastSyncedAt: new Date(),
          syncStatus: 'synced',
        },
      });

      return response.data;
    }

    throw new Error(`Failed to update material: ${JSON.stringify(response.data)}`);
  }

  /**
   * Generate a code from name
   */
  generateCode(name) {
    return name
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 20);
  }

  /**
   * Format missing fields for display
   */
  formatMissingFields(fields) {
    const labels = {
      price: '• **Price** (e.g., "$45.99" or "45.99")',
      cost: '• **Cost** (your supplier cost)',
      unitOfMeasure: '• **Unit** (e.g., "Each", "Box", "Foot")',
      name: '• **Name** of the item',
      code: '• **Code** (SKU/part number)',
    };

    return fields.map(f => labels[f] || `• **${f}**`).join('\n');
  }
}

export default PricebookChatAgent;

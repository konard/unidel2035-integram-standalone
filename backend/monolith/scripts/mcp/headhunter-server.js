#!/usr/bin/env node

/**
 * HeadHunter (hh.ru) MCP Server
 *
 * MCP server for accessing HeadHunter API
 * API Documentation: https://github.com/hhru/api
 * Base URL: https://api.hh.ru
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

/**
 * HeadHunter API Client
 */
class HeadHunterClient {
  constructor() {
    this.baseURL = 'https://api.hh.ru';
    this.accessToken = null;
    this.userAgent = 'DronDoc/1.0 (https://dronedoc.ru)';
  }

  /**
   * Set OAuth access token (optional, for authenticated requests)
   */
  setAccessToken(token) {
    this.accessToken = token;
  }

  /**
   * Get common headers for requests
   */
  getHeaders() {
    const headers = {
      'User-Agent': this.userAgent,
      'HH-User-Agent': this.userAgent
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    return headers;
  }

  /**
   * Search vacancies
   * @param {Object} params - Search parameters
   * @returns {Promise<Object>} Search results
   */
  async searchVacancies(params = {}) {
    try {
      const response = await axios.get(`${this.baseURL}/vacancies`, {
        headers: this.getHeaders(),
        params: {
          text: params.text || '',
          area: params.area || undefined, // Area ID (e.g., 1 for Moscow)
          salary: params.salary || undefined,
          only_with_salary: params.onlyWithSalary || undefined,
          experience: params.experience || undefined, // noExperience, between1And3, between3And6, moreThan6
          employment: params.employment || undefined, // full, part, project, volunteer, probation
          schedule: params.schedule || undefined, // fullDay, shift, flexible, remote, flyInFlyOut
          search_field: params.searchField || undefined, // name, company_name, description
          page: params.page || 0,
          per_page: params.perPage || 20,
          order_by: params.orderBy || 'relevance' // relevance, publication_time, salary_desc, salary_asc
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Search vacancies error: ${error.message}`);
    }
  }

  /**
   * Get vacancy details by ID
   * @param {number} vacancyId - Vacancy ID
   * @returns {Promise<Object>} Vacancy details
   */
  async getVacancy(vacancyId) {
    try {
      const response = await axios.get(`${this.baseURL}/vacancies/${vacancyId}`, {
        headers: this.getHeaders()
      });

      return response.data;
    } catch (error) {
      throw new Error(`Get vacancy error: ${error.message}`);
    }
  }

  /**
   * Get dictionaries (reference data)
   * @returns {Promise<Object>} Dictionaries
   */
  async getDictionaries() {
    try {
      const response = await axios.get(`${this.baseURL}/dictionaries`, {
        headers: this.getHeaders()
      });

      return response.data;
    } catch (error) {
      throw new Error(`Get dictionaries error: ${error.message}`);
    }
  }

  /**
   * Get areas (regions/cities)
   * @param {number} areaId - Area ID (optional)
   * @returns {Promise<Object>} Areas
   */
  async getAreas(areaId = null) {
    try {
      const url = areaId
        ? `${this.baseURL}/areas/${areaId}`
        : `${this.baseURL}/areas`;

      const response = await axios.get(url, {
        headers: this.getHeaders()
      });

      return response.data;
    } catch (error) {
      throw new Error(`Get areas error: ${error.message}`);
    }
  }

  /**
   * Get professional roles
   * @returns {Promise<Array>} Professional roles
   */
  async getProfessionalRoles() {
    try {
      const response = await axios.get(`${this.baseURL}/professional_roles`, {
        headers: this.getHeaders()
      });

      return response.data;
    } catch (error) {
      throw new Error(`Get professional roles error: ${error.message}`);
    }
  }

  /**
   * Get similar vacancies
   * @param {number} vacancyId - Vacancy ID
   * @returns {Promise<Object>} Similar vacancies
   */
  async getSimilarVacancies(vacancyId) {
    try {
      const response = await axios.get(`${this.baseURL}/vacancies/${vacancyId}/similar_vacancies`, {
        headers: this.getHeaders()
      });

      return response.data;
    } catch (error) {
      throw new Error(`Get similar vacancies error: ${error.message}`);
    }
  }

  /**
   * Get employer information
   * @param {number} employerId - Employer ID
   * @returns {Promise<Object>} Employer details
   */
  async getEmployer(employerId) {
    try {
      const response = await axios.get(`${this.baseURL}/employers/${employerId}`, {
        headers: this.getHeaders()
      });

      return response.data;
    } catch (error) {
      throw new Error(`Get employer error: ${error.message}`);
    }
  }

  /**
   * Search employer by company name (uses vacancy search with employer filter)
   * @param {string} companyName - Company name to search
   * @returns {Promise<Object>} Employer info with vacancies
   */
  async searchEmployerByName(companyName) {
    try {
      // Search vacancies with company name in search field
      const response = await axios.get(`${this.baseURL}/vacancies`, {
        headers: this.getHeaders(),
        params: {
          text: companyName,
          search_field: 'company_name',
          per_page: 100
        }
      });

      // Extract unique employers
      const employers = new Map();

      if (response.data.items) {
        response.data.items.forEach(vacancy => {
          if (vacancy.employer && !employers.has(vacancy.employer.id)) {
            employers.set(vacancy.employer.id, {
              id: vacancy.employer.id,
              name: vacancy.employer.name,
              url: vacancy.employer.alternate_url,
              vacancies_url: vacancy.employer.vacancies_url,
              trusted: vacancy.employer.trusted || false,
              vacancies_count: 0,
              areas: new Set()
            });
          }

          if (vacancy.employer && employers.has(vacancy.employer.id)) {
            const emp = employers.get(vacancy.employer.id);
            emp.vacancies_count++;
            if (vacancy.area) emp.areas.add(vacancy.area.name);
          }
        });
      }

      return {
        found: employers.size,
        employers: Array.from(employers.values()).map(emp => ({
          ...emp,
          areas: Array.from(emp.areas)
        }))
      };
    } catch (error) {
      throw new Error(`Search employer error: ${error.message}`);
    }
  }

  /**
   * Get salary statistics by professional role and area
   * Note: HH.ru doesn't have dedicated salary statistics API in public docs
   * This method aggregates data from vacancy search
   * @param {string} professionalRole - Professional role (e.g., "Python developer", "Бухгалтер")
   * @param {number} areaId - Area ID (optional, e.g., 1 for Moscow)
   * @returns {Promise<Object>} Salary statistics
   */
  async getSalaryStatistics(professionalRole, areaId = null) {
    try {
      const params = {
        text: professionalRole,
        only_with_salary: true,
        per_page: 100,
        order_by: 'salary_desc'
      };

      if (areaId) params.area = areaId;

      const response = await axios.get(`${this.baseURL}/vacancies`, {
        headers: this.getHeaders(),
        params
      });

      const vacancies = response.data.items || [];

      // Calculate statistics
      const salaries = vacancies
        .map(v => v.salary)
        .filter(s => s && s.from !== null);

      if (salaries.length === 0) {
        return {
          found: 0,
          average: null,
          median: null,
          min: null,
          max: null,
          currency: 'RUR',
          professionalRole,
          areaId
        };
      }

      // Calculate average from 'from' field
      const avgSalaries = salaries.map(s => s.from || s.to || 0);
      const sum = avgSalaries.reduce((a, b) => a + b, 0);
      const avg = Math.round(sum / avgSalaries.length);

      // Calculate median
      const sorted = avgSalaries.sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 0
        ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
        : sorted[mid];

      return {
        found: salaries.length,
        average: avg,
        median: median,
        min: Math.min(...avgSalaries),
        max: Math.max(...avgSalaries),
        currency: salaries[0].currency || 'RUR',
        sampleSize: vacancies.length,
        totalFound: response.data.found,
        professionalRole,
        areaId
      };
    } catch (error) {
      throw new Error(`Get salary statistics error: ${error.message}`);
    }
  }
}

// Global client instance
const client = new HeadHunterClient();

// Define available tools
const TOOLS = [
  {
    name: 'hh_set_access_token',
    description: 'Set OAuth access token for authenticated requests (optional)',
    inputSchema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'OAuth access token'
        }
      },
      required: ['token']
    }
  },
  {
    name: 'hh_search_vacancies',
    description: 'Search vacancies on hh.ru with various filters',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Search query text'
        },
        area: {
          type: 'number',
          description: 'Area ID (e.g., 1 for Moscow, 2 for Saint Petersburg)'
        },
        salary: {
          type: 'number',
          description: 'Minimum salary'
        },
        onlyWithSalary: {
          type: 'boolean',
          description: 'Show only vacancies with specified salary'
        },
        experience: {
          type: 'string',
          description: 'Experience level: noExperience, between1And3, between3And6, moreThan6'
        },
        employment: {
          type: 'string',
          description: 'Employment type: full, part, project, volunteer, probation'
        },
        schedule: {
          type: 'string',
          description: 'Schedule: fullDay, shift, flexible, remote, flyInFlyOut'
        },
        searchField: {
          type: 'string',
          description: 'Search field: name, company_name, description'
        },
        page: {
          type: 'number',
          description: 'Page number (0-based)'
        },
        perPage: {
          type: 'number',
          description: 'Items per page (max 100)'
        },
        orderBy: {
          type: 'string',
          description: 'Sort order: relevance, publication_time, salary_desc, salary_asc'
        }
      }
    }
  },
  {
    name: 'hh_get_vacancy',
    description: 'Get detailed information about a specific vacancy',
    inputSchema: {
      type: 'object',
      properties: {
        vacancyId: {
          type: 'number',
          description: 'Vacancy ID'
        }
      },
      required: ['vacancyId']
    }
  },
  {
    name: 'hh_get_dictionaries',
    description: 'Get reference dictionaries (experience levels, employment types, schedules, etc.)',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'hh_get_areas',
    description: 'Get available areas (regions, cities)',
    inputSchema: {
      type: 'object',
      properties: {
        areaId: {
          type: 'number',
          description: 'Area ID (optional, for specific area details)'
        }
      }
    }
  },
  {
    name: 'hh_get_professional_roles',
    description: 'Get professional roles catalog',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'hh_get_similar_vacancies',
    description: 'Find vacancies similar to a specific vacancy',
    inputSchema: {
      type: 'object',
      properties: {
        vacancyId: {
          type: 'number',
          description: 'Vacancy ID'
        }
      },
      required: ['vacancyId']
    }
  },
  {
    name: 'hh_get_employer',
    description: 'Get employer information',
    inputSchema: {
      type: 'object',
      properties: {
        employerId: {
          type: 'number',
          description: 'Employer ID'
        }
      },
      required: ['employerId']
    }
  },
  {
    name: 'hh_search_employer',
    description: 'Search employer (company) by name on hh.ru',
    inputSchema: {
      type: 'object',
      properties: {
        companyName: {
          type: 'string',
          description: 'Company name to search for'
        }
      },
      required: ['companyName']
    }
  },
  {
    name: 'hh_salary_statistics',
    description: 'Get salary statistics for a professional role in specific area',
    inputSchema: {
      type: 'object',
      properties: {
        professionalRole: {
          type: 'string',
          description: 'Professional role (e.g., "Python developer", "Бухгалтер")'
        },
        areaId: {
          type: 'number',
          description: 'Area ID (optional, e.g., 1 for Moscow)'
        }
      },
      required: ['professionalRole']
    }
  }
];

// Create MCP server
const server = new Server(
  {
    name: 'headhunter-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool list requests
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'hh_set_access_token':
        client.setAccessToken(args.token);
        return {
          content: [{
            type: 'text',
            text: 'Access token set successfully'
          }]
        };

      case 'hh_search_vacancies': {
        const results = await client.searchVacancies(args);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results, null, 2)
          }]
        };
      }

      case 'hh_get_vacancy': {
        const vacancy = await client.getVacancy(args.vacancyId);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(vacancy, null, 2)
          }]
        };
      }

      case 'hh_get_dictionaries': {
        const dictionaries = await client.getDictionaries();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(dictionaries, null, 2)
          }]
        };
      }

      case 'hh_get_areas': {
        const areas = await client.getAreas(args.areaId);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(areas, null, 2)
          }]
        };
      }

      case 'hh_get_professional_roles': {
        const roles = await client.getProfessionalRoles();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(roles, null, 2)
          }]
        };
      }

      case 'hh_get_similar_vacancies': {
        const similar = await client.getSimilarVacancies(args.vacancyId);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(similar, null, 2)
          }]
        };
      }

      case 'hh_get_employer': {
        const employer = await client.getEmployer(args.employerId);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(employer, null, 2)
          }]
        };
      }

      case 'hh_search_employer': {
        const employers = await client.searchEmployerByName(args.companyName);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(employers, null, 2)
          }]
        };
      }

      case 'hh_salary_statistics': {
        const stats = await client.getSalaryStatistics(
          args.professionalRole,
          args.areaId
        );
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(stats, null, 2)
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.message}`
      }],
      isError: true
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('HeadHunter MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

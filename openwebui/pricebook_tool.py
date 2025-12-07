"""
title: ServiceTitan Pricebook Tool
author: Perfect Catch
version: 1.0.0
description: Search and query the ServiceTitan pricebook for materials, services, equipment, and categories
"""

import requests
from typing import Optional
from pydantic import BaseModel, Field


class Tools:
    def __init__(self):
        self.base_url = "http://perfect-catch-st-automation:3001"
        self.session_id = "openwebui"

    def search_pricebook(
        self,
        query: str,
    ) -> str:
        """
        Search the ServiceTitan pricebook for materials, services, equipment, and categories.
        Use this tool when the user asks about:
        - Finding parts, materials, or supplies
        - Looking up service prices
        - Searching for equipment
        - Browsing pricebook categories
        - Getting pricing information
        
        :param query: Natural language search query (e.g., "find pool pump parts", "show me transformers under $200", "list electrical categories")
        :return: Search results with items and prices
        """
        try:
            response = requests.post(
                f"{self.base_url}/chat/pricebook",
                json={"sessionId": self.session_id, "message": query},
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            
            if data.get("success"):
                return data.get("message", "No results found")
            else:
                return f"Error: {data.get('error', 'Unknown error')}"
                
        except requests.exceptions.ConnectionError:
            return "Error: Could not connect to Pricebook service. Make sure the service is running."
        except requests.exceptions.Timeout:
            return "Error: Request timed out. Please try again."
        except Exception as e:
            return f"Error: {str(e)}"

    def get_pricebook_categories(self) -> str:
        """
        Get all available pricebook categories.
        Use this when the user wants to browse or see what categories are available.
        
        :return: List of pricebook categories
        """
        return self.search_pricebook("show me all categories")

    def get_pricebook_status(self) -> str:
        """
        Get the current status of the pricebook database including item counts.
        Use this when the user asks about pricebook statistics or sync status.
        
        :return: Pricebook status and statistics
        """
        try:
            response = requests.get(
                f"{self.base_url}/api/sync/pricebook/status",
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            
            if data.get("success"):
                stats = data.get("stats", [])
                result = "**Pricebook Status:**\n\n"
                for stat in stats:
                    entity = stat.get("entity_type", "unknown").title()
                    total = stat.get("total_count", 0)
                    result += f"• {entity}: {total} items\n"
                
                scheduler = data.get("scheduler", {})
                if scheduler.get("isRunning"):
                    result += f"\n**Sync Scheduler:** Running\n"
                    result += f"• Full sync: {scheduler.get('schedules', {}).get('fullSync', 'N/A')}\n"
                    result += f"• Incremental: {scheduler.get('schedules', {}).get('incrementalSync', 'N/A')}\n"
                
                return result
            else:
                return f"Error: {data.get('error', 'Unknown error')}"
                
        except Exception as e:
            return f"Error getting status: {str(e)}"

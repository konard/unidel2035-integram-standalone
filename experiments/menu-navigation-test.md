# Menu Navigation Issue - Experiment

## Problem Identified

In `AppMenuItem.vue`, the `itemClick` function has a condition that prevents navigation for items with both `to` and `items`:

```javascript
// Line 132-143
if (item.to && !item.items) {  // <-- PROBLEM: Only navigates if NO items
    event.preventDefault();
    router.push(item.to);
    // ...
}
```

## Root Cause

Menu items structured like this won't navigate:
```json
{
  "label": "Sandbox",
  "to": "/api-v2-sandbox",
  "items": [/* children */]
}
```

or

```json
{
  "label": "Api",
  "to": "/integram/my/api-docs",
  "items": [/* children */]
}
```

Because the condition `!item.items` is false when items array exists.

## Expected Behavior

When clicking on a parent menu item that has both a route and children:
- The item should navigate to its route
- Children should still be accessible via expansion

## Solution

Change the logic to allow navigation for items with `to`, regardless of whether they have children.

The distinction should be:
- If item has `to` - navigate to that route
- If item has `items` - toggle expansion (but don't prevent navigation)

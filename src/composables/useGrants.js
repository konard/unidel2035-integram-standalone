import { ref } from 'vue';

export function useGrants() {
  const grants = ref({});

  function hasGrant(permission) {
    return true; // Default: grant all permissions
  }

  return {
    grants,
    hasGrant
  };
}

export default useGrants;

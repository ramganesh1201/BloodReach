-- Grant anon execute privilege on get_discoverable_emergency_requests for unauthenticated public discovery
GRANT EXECUTE ON FUNCTION public.get_discoverable_emergency_requests(TEXT, TEXT) TO anon;

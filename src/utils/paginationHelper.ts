interface PaginationQueryInput {
    page?: string | number;
    limit?: string | number;
    [key: string]: any; // Allows passing any other query filters along with pagination
}

interface PaginationResult {
    page: number;
    limit: number;
    skip: number;
}

export const buildPaginationQuery = (query: PaginationQueryInput): PaginationResult => {
    // 1. Extract values and ensure they are parsed as Base-10 integers
    const rawPage = parseInt(String(query?.page), 10);
    const rawLimit = parseInt(String(query?.limit), 10);

    // 2. Apply bulletproof defaults if inputs are NaN, negative, or zero
    const page = !isNaN(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = !isNaN(rawLimit) && rawLimit > 0 ? rawLimit : 10; // Default to 10 records per page

    // 3. Prevent performance issues by putting a hard cap on maximum batch retrievals
    const sanitizedLimit = limit > 100 ? 100 : limit;

    // 4. Calculate the document offset index position for MongoDB
    const skip = (page - 1) * sanitizedLimit;

    return {
        page,
        limit: sanitizedLimit,
        skip,
    };
};

import { NextRequest, NextResponse } from "next/server";
import { createGraphQLClient } from "@bigcommerce/translations-graphql-client";
import { getSessionFromContext } from "@/lib/auth";

// GET - Fetch categories with translations
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const context = searchParams.get("context");
    const channelId = searchParams.get("channelId");
    const locale = searchParams.get("locale");

    if (!channelId || !locale) {
      return NextResponse.json(
        { error: "channelId and locale are required" },
        { status: 400 }
      );
    }

    if (!context) {
      return NextResponse.json(
        { error: "Context is required" },
        { status: 400 }
      );
    }

    // Get session from context
    const { accessToken, storeHash } = await getSessionFromContext(context);

    // Create GraphQL client
    const graphqlClient = createGraphQLClient(accessToken, storeHash);

    console.log('[Categories GET] Fetching with:', { channelId, locale });

    // Fetch categories
    const result = await graphqlClient.getCategoryTranslations({
      channelId: Number(channelId),
      locale,
      first: 250,
    });

    console.log('[Categories GET] Result:', { 
      edgesCount: result.edges?.length || 0 
    });

    // Transform data
    const categories = (result.edges || []).map((edge: any) => ({
      id: parseInt(edge.node.id.split("/").pop() || "0", 10),
      name: edge.node.name,
      translation: edge.node.overridesForLocale?.name || "",
    }));

    console.log('[Categories GET] Returning categories:', categories.length);
    return NextResponse.json(categories);
  } catch (error: any) {
    console.error("[Categories GET] Error fetching categories:", error);
    console.error("[Categories GET] Error details:", {
      message: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: error.message || "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

// PUT - Update category translation
export async function PUT(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const context = searchParams.get("context");
    const body = await request.json();

    const { categoryId, channelId, locale, translation } = body;

    if (!categoryId || !channelId || !locale) {
      return NextResponse.json(
        { error: "categoryId, channelId, and locale are required" },
        { status: 400 }
      );
    }

    if (!context) {
      return NextResponse.json(
        { error: "Context is required" },
        { status: 400 }
      );
    }

    // Get session from context
    const { accessToken, storeHash } = await getSessionFromContext(context);

    // Create GraphQL client
    const graphqlClient = createGraphQLClient(accessToken, storeHash);

    // Update category translation
    const fields = [];
    if (translation) {
      fields.push({
        fieldName: "name",
        value: translation,
      });
    }

    if (fields.length > 0) {
      await graphqlClient.updateCategoryTranslations({
        channelId: Number(channelId),
        locale,
        categories: [
          {
            categoryId: Number(categoryId),
            fields,
          },
        ],
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating category translation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update translation" },
      { status: 500 }
    );
  }
}


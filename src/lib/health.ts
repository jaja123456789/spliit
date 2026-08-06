import { prisma } from '@/lib/prisma'

export interface HealthCheckStatus {
  status: 'healthy' | 'unhealthy'
  /** Build identity, so a running instance can be told apart from the image it came from. */
  version: string
  commit: string
  services?: {
    database?: {
      status: 'healthy' | 'unhealthy'
      error?: string
    }
  }
}

// Baked into the image by the Dockerfile. Read straight from the environment rather than through
// lib/env.ts so a missing value degrades to "unknown" instead of failing env validation.
const buildInfo = {
  version: process.env.APP_VERSION || 'unknown',
  commit: process.env.APP_COMMIT || 'unknown',
}

async function checkDatabase(): Promise<{
  status: 'healthy' | 'unhealthy'
  error?: string
}> {
  try {
    // Simple query to test database connectivity
    await prisma.$queryRaw`SELECT 1`
    return {
      status: 'healthy',
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      error:
        error instanceof Error ? error.message : 'Database connection failed',
    }
  }
}

function createHealthResponse(
  data: HealthCheckStatus,
  isHealthy: boolean,
): Response {
  return new Response(JSON.stringify(data), {
    status: isHealthy ? 200 : 503,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Type': 'application/json',
    },
  })
}

export async function checkReadiness(): Promise<Response> {
  try {
    const databaseStatus = await checkDatabase()

    const services: HealthCheckStatus['services'] = {
      database: databaseStatus,
    }

    // For readiness: healthy only if all services are healthy
    const isHealthy = databaseStatus.status === 'healthy'

    const healthStatus: HealthCheckStatus = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      ...buildInfo,
      services,
    }

    return createHealthResponse(healthStatus, isHealthy)
  } catch (error) {
    const errorStatus: HealthCheckStatus = {
      status: 'unhealthy',
      ...buildInfo,
      services: {
        database: {
          status: 'unhealthy',
          error:
            error instanceof Error ? error.message : 'Readiness check failed',
        },
      },
    }

    return createHealthResponse(errorStatus, false)
  }
}

export async function checkLiveness(): Promise<Response> {
  try {
    // Liveness: Only check if the app process is alive
    // No database or external service checks - restarting won't fix those
    const healthStatus: HealthCheckStatus = {
      status: 'healthy',
      ...buildInfo,
      // No services reported - we don't check them for liveness
    }

    return createHealthResponse(healthStatus, true) // Always 200 for liveness
  } catch (error) {
    // This should rarely happen, but if it does, the app needs restart
    const errorStatus: HealthCheckStatus = {
      status: 'unhealthy',
      ...buildInfo,
    }

    return createHealthResponse(errorStatus, false)
  }
}

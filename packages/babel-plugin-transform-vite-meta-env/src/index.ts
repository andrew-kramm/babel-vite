import type babelCore from '@babel/core'

export type ViteMetaEnvPluginOptions = {
  envPrefix?: string | string[]
}

const DEFAULT_ENV_PREFIX = 'VITE_'

const replaceVars = [
  {
    regex: /^(NODE_ENV|MODE)$/,
    replacement: (template: typeof babelCore.template) =>
      template.expression.ast("process.env.NODE_ENV || 'test'")
  },
  {
    regex: /^BASE_URL$/,
    replacement: (template: typeof babelCore.template) => template.expression.ast("'/'")
  },
  {
    regex: /^DEV$/,
    replacement: (template: typeof babelCore.template) =>
      template.expression.ast("process.env.NODE_ENV !== 'production'")
  },
  {
    regex: /^PROD$/,
    replacement: (template: typeof babelCore.template) =>
      template.expression.ast("process.env.NODE_ENV === 'production'")
  }
]

const getPrefixes = ({ envPrefix }: ViteMetaEnvPluginOptions): string[] => {
  if (typeof envPrefix === 'string') {
    return [envPrefix]
  }
  if (Array.isArray(envPrefix)) {
    return envPrefix
  }
  return [DEFAULT_ENV_PREFIX]
}

const replaceEnv = (template: typeof babelCore.template, prefixes: string[]) => {
  const propertyMatches = prefixes
    .map(
      (prefix) =>
        `...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('${prefix}'))),`
    )
    .join('\n')

  return template.expression.ast(`{
    ${propertyMatches}
    NODE_ENV: process.env.NODE_ENV || 'test',
    MODE: process.env.NODE_ENV || 'test',
    BASE_URL: '/',
    DEV: process.env.NODE_ENV !== 'production',
    PROD: process.env.NODE_ENV === 'production'
  }`)
}

function getReplacement(
  variableName: string,
  template: typeof babelCore.template,
  prefixes: string[]
): babelCore.types.Expression | undefined {
  return (
    replaceVars
      .filter(({ regex }) => regex.test(variableName))
      .map(({ replacement }) => replacement(template))[0] ??
    (prefixes.some((prefix) => variableName.startsWith(prefix))
      ? template.expression('process.env.%%variableName%%')({ variableName })
      : undefined)
  )
}

export default function viteMetaEnvBabelPlugin({
  template,
  types: t
}: typeof babelCore): babelCore.PluginObj<
  babelCore.PluginPass & { opts: ViteMetaEnvPluginOptions }
> {
  return {
    name: 'vite-meta-env',
    visitor: {
      MemberExpression(path, { opts }) {
        const envNode = t.isMemberExpression(path.node.object) && path.node.object
        const variableName = t.isIdentifier(path.node.property) && path.node.property.name

        if (!envNode || !variableName) {
          return
        }

        const isMetaProperty = t.isMetaProperty(envNode.object)
        const isEnvVar = t.isIdentifier(envNode.property) && envNode.property.name === 'env'

        if (!isMetaProperty || !isEnvVar) {
          return
        }

        const replacement = getReplacement(variableName, template, getPrefixes(opts))

        if (replacement) {
          path.replaceWith(replacement)
        }
      },
      MetaProperty(path, { opts }) {
        const envNode = t.isMemberExpression(path.parentPath.node) && path.parentPath.node

        if (!envNode) {
          return
        }

        const isEnvVar = t.isIdentifier(envNode.property) && envNode.property.name === 'env'

        if (!isEnvVar) {
          return
        }

        path.parentPath.replaceWith(replaceEnv(template, getPrefixes(opts)))
      }
    }
  }
}

import { Common, Linter, Plugin, SDK } from '@rsdoctor/types';
import assert from 'assert';
import type {
  RuleSetCondition as RspackRuleSetCondition,
  RuleSetRule as RspackRuleSetRule,
} from '@rspack/core';
import {
  RuleSetCondition as WebpackRuleSetCondition,
  RuleSetConditionAbsolute as WebpackRuleSetConditionAbsolute,
  RuleSetRule as WebpackRuleSetRule,
} from 'webpack';
import {
  RsdoctorWebpackPluginOptions,
  RsdoctorPluginOptionsNormalized,
  IReportCodeType,
  RsdoctorRspackPluginOptions,
  RsdoctorRspackPluginOptionsNormalized,
} from '@/types';
import { chalk, logger } from '@rsdoctor/utils/logger';

function defaultBoolean(v: unknown, dft: boolean): boolean {
  return typeof v === 'boolean' ? v : dft;
}

export function normalizeUserConfig<Rules extends Linter.ExtendRuleData[]>(
  config: RsdoctorWebpackPluginOptions<Rules> = {},
): RsdoctorPluginOptionsNormalized<Rules> {
  const {
    linter = {},
    features = {},
    loaderInterceptorOptions = {},
    disableClientServer = false,
    sdkInstance,
    innerClientPath = '',
    output = {
      reportCodeType: {
        noModuleSource: false,
        noAssetsAndModuleSource: false,
        noCode: false,
      },
      reportDir: '',
      compressData: true,
    },
    supports = {
      parseBundle: true,
      banner: undefined,
      generateTileGraph: true,
      gzip: false,
    },
    port,
    printLog = { serverUrls: true },
    mode = 'normal',
    brief = {
      reportHtmlDir: undefined,
      reportHtmlName: undefined,
      writeDataJson: false,
    },
  } = config;

  assert(linter && typeof linter === 'object');
  assert(features && typeof features === 'object');
  assert(
    loaderInterceptorOptions && typeof loaderInterceptorOptions === 'object',
  );
  assert(typeof disableClientServer === 'boolean');

  const _features: RsdoctorPluginOptionsNormalized['features'] = Array.isArray(
    features,
  )
    ? {
        loader: features.includes('loader'),
        plugins: features.includes('plugins'),
        resolver: features.includes('resolver'),
        bundle: features.includes('bundle'),
        treeShaking: features.includes('treeShaking'),
        lite: features.includes('lite') || mode === SDK.IMode[SDK.IMode.lite],
      }
    : {
        loader: defaultBoolean(features.loader, true),
        plugins: defaultBoolean(features.plugins, true),
        resolver: defaultBoolean(features.resolver, false),
        bundle: defaultBoolean(features.bundle, true),
        treeShaking: defaultBoolean(features.treeShaking, false),
        lite:
          defaultBoolean(features.lite, false) ||
          mode === SDK.IMode[SDK.IMode.lite],
      };

  const _linter: RsdoctorPluginOptionsNormalized<Rules>['linter'] = {
    rules: {} as RsdoctorPluginOptionsNormalized<Rules>['linter']['rules'],
    extends: [] as unknown as any,
    level: 'Error',
    ...linter,
  };

  const res: RsdoctorPluginOptionsNormalized<Rules> = {
    linter: _linter,
    features: _features,
    loaderInterceptorOptions: {
      skipLoaders: Array.isArray(loaderInterceptorOptions.skipLoaders)
        ? loaderInterceptorOptions.skipLoaders
        : [],
    },
    disableClientServer,
    sdkInstance,
    output: {
      /**
       * Data storage is divided into three types:
       * The first type: normal mode, all codes are saved.
       * The second type: lite is the same as reportCodeType.noModuleSource, which lacks module source code.
       * The third type: reportCodeType.noAssetsAndModuleSource means there is no module source code nor the packaged product code.
       *
       *  */
      reportCodeType: output.reportCodeType
        ? normalizeReportType(output.reportCodeType, mode)
        : normalizeReportType(
            {
              noModuleSource: false,
              noAssetsAndModuleSource: false,
              noCode: false,
            },
            mode,
          ),
      reportDir: output.reportDir || '',
      compressData:
        output.compressData !== undefined ? output.compressData : true,
    },
    innerClientPath,
    supports,
    port,
    printLog,
    mode,
    brief,
  };
  if (
    output.compressData === false &&
    ((output.reportCodeType &&
      !output.reportCodeType?.noAssetsAndModuleSource) ||
      !output.reportCodeType)
  ) {
    logger.info(
      chalk.yellow(
        `[RSDOCTOR]: When you use compressData: false, it is recommended to set output.reportCodeType to { noAssetsAndModuleSource: true }.`,
      ),
    );
  }
  return res;
}

export function makeRuleSetSerializable(
  item:
    | RspackRuleSetCondition
    | WebpackRuleSetConditionAbsolute
    | WebpackRuleSetCondition
    | void,
) {
  if (!item) return;

  if (item instanceof RegExp) {
    // Used by the JSON.stringify method to enable the transformation of an object's data for JavaScript Object Notation (JSON) serialization.
    (item as Common.PlainObject).toJSON = item.toString;
  } else if (Array.isArray(item)) {
    item.forEach((i) => makeRuleSetSerializable(i));
  } else if (typeof item === 'object') {
    makeRuleSetSerializable(item.and);
    makeRuleSetSerializable(item.or);
    makeRuleSetSerializable(item.not);
  }
}

export function makeRulesSerializable(
  rules:
    | Plugin.RuleSetRule[]
    | RspackRuleSetRule['oneOf']
    | WebpackRuleSetRule['oneOf'],
) {
  if (!Array.isArray(rules)) return;

  if (!rules.length) return;

  rules.forEach((rule) => {
    if (!rule) return;

    makeRuleSetSerializable(rule.test);
    makeRuleSetSerializable(rule.resourceQuery);
    makeRuleSetSerializable(rule.resource);
    makeRuleSetSerializable(rule.resourceFragment);
    makeRuleSetSerializable(rule.scheme);
    makeRuleSetSerializable(rule.issuer);

    if ('issuerLayer' in rule) {
      makeRuleSetSerializable(rule.issuerLayer);
    }

    makeRuleSetSerializable(rule.include);
    makeRuleSetSerializable(rule.exclude);

    if (rule.oneOf) {
      makeRulesSerializable(rule.oneOf);
    }

    if ('rules' in rule && rule.rules) {
      makeRulesSerializable(rule.rules);
    }
  });
}

export const normalizeReportType = (
  reportCodeType: IReportCodeType,
  mode: keyof typeof SDK.IMode,
): SDK.ToDataType => {
  let globalReportCodeType = SDK.ToDataType.Normal;

  switch (mode) {
    case SDK.IMode[SDK.IMode.brief]:
      globalReportCodeType = SDK.ToDataType.NoCode;
      break;
    case SDK.IMode[SDK.IMode.lite]:
      if (reportCodeType.noAssetsAndModuleSource) {
        globalReportCodeType = SDK.ToDataType.NoSourceAndAssets;
      } else {
        globalReportCodeType = SDK.ToDataType.NoSource;
      }
      break;
    default: {
      if (reportCodeType.noCode) {
        globalReportCodeType = SDK.ToDataType.NoCode;
      } else if (reportCodeType.noAssetsAndModuleSource) {
        globalReportCodeType = SDK.ToDataType.NoSourceAndAssets;
      } else if (reportCodeType.noModuleSource) {
        globalReportCodeType = SDK.ToDataType.NoSource;
      } else {
        globalReportCodeType = SDK.ToDataType.Normal;
      }
    }
  }
  return globalReportCodeType;
};

export function normalizeRspackUserOptions<
  Rules extends Linter.ExtendRuleData[],
>(
  options: RsdoctorRspackPluginOptions<Rules>,
): RsdoctorRspackPluginOptionsNormalized<Rules> {
  const config: RsdoctorRspackPluginOptionsNormalized<Rules> =
    normalizeUserConfig(options);
  config.experiments ??= {};
  config.experiments.enableNativePlugin =
    options.experiments?.enableNativePlugin ?? false;
  return config;
}

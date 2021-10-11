import { observable, computed, makeObservable } from "mobx";
import Cartographic from "terriajs-cesium/Source/Core/Cartographic";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import FunctionParameter, { Options } from "./FunctionParameter";
import isDefined from "../../Core/isDefined";
import { Feature, Point } from "geojson";
import { GeoJsonFunctionParameter } from "./GeoJsonParameter";
import CatalogFunctionMixin from "../../ModelMixins/CatalogFunctionMixin";

export type CartographicPoint = {
  longitude: number;
  latitude: number;
  height: number;
};

export default class PointParameter extends FunctionParameter<CartographicPoint>
  implements GeoJsonFunctionParameter {
  static readonly type = "point";
  readonly type = "point";

  constructor(
    protected readonly catalogFunction: CatalogFunctionMixin,
    options: Options
  ) {
    super(catalogFunction, options);

    makeObservable(this);
  }

  /**
   * Get feature as geojson for display on map.
   */
  static getGeoJsonFeature(value: CartographicPoint): Feature<Point> {
    var coordinates = [
      CesiumMath.toDegrees(value.longitude),
      CesiumMath.toDegrees(value.latitude),
      value.height
    ];

    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: coordinates
      },
      properties: {}
    };
  }

  /**
   * Process value so that it can be used in an URL.
   */
  static formatValueForUrl(value: Cartographic) {
    return JSON.stringify({
      type: "FeatureCollection",
      features: [PointParameter.getGeoJsonFeature(value)]
    });
  }

  @computed get geoJsonFeature() {
    if (isDefined(this.value)) {
      return PointParameter.getGeoJsonFeature(this.value);
    }
  }
}

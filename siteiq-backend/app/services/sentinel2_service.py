from app.services.gee import fetch_sentinel2


class Sentinel2Service:

    @staticmethod
    def run(
        lat: float,
        lon: float,
        start_date: str,
        end_date: str,
        cloud_percentage: float = 30,
    ):
        """
        Run the Sentinel-2 pipeline.

        The service layer is responsible for calling GEE.
        Band calculations and indices will be added later.
        """

        result = fetch_sentinel2(
            lat=lat,
            lon=lon,
            start_date=start_date,
            end_date=end_date,
            cloud_percentage=cloud_percentage,
        )

        return result

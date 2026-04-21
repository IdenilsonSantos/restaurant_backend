import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Driver } from './entities/driver.entity';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';

@Injectable()
export class DriverService {
  constructor(
    @InjectRepository(Driver)
    private readonly driverRepository: Repository<Driver>,
  ) {}

  async create(dto: CreateDriverDto): Promise<Driver> {
    const driver = this.driverRepository.create(dto);
    return this.driverRepository.save(driver);
  }

  async findOne(id: string): Promise<Driver> {
    const driver = await this.driverRepository.findOne({ where: { id } });

    if (!driver) {
      throw new NotFoundException(`Driver with id "${id}" not found`);
    }

    return driver;
  }

  async findByUserId(userId: string): Promise<Driver> {
    const driver = await this.driverRepository.findOne({ where: { userId } });

    if (!driver) {
      throw new NotFoundException(
        `Driver profile for userId "${userId}" not found`,
      );
    }

    return driver;
  }

  async update(id: string, dto: UpdateDriverDto): Promise<Driver> {
    const driver = await this.findOne(id);
    Object.assign(driver, dto);
    return this.driverRepository.save(driver);
  }

  async updateLocation(
    id: string,
    latitude: number,
    longitude: number,
  ): Promise<Driver> {
    const driver = await this.findOne(id);
    driver.currentLatitude = latitude;
    driver.currentLongitude = longitude;
    return this.driverRepository.save(driver);
  }

  async setAvailability(id: string, available: boolean): Promise<Driver> {
    const driver = await this.findOne(id);
    driver.isAvailable = available;
    return this.driverRepository.save(driver);
  }
}

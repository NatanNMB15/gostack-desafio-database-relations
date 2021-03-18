import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customerExists = await this.customersRepository.findById(customer_id);

    if (!customerExists)
      throw new AppError('Could not find any customers with the given id');

    const existentProducts = await this.productsRepository.findAllById(
      products,
    );

    if (!existentProducts.length)
      throw new AppError('Could not find any customers with the given ids');

    const existingProductsIds = existentProducts.map(product => product.id);

    const checkInexistentProducts = products.filter(
      product => !existingProductsIds.includes(product.id),
    );

    if (checkInexistentProducts.length) {
      throw new AppError(
        `Could not find product(s): ${checkInexistentProducts
          .map(product => product.id)
          .join(', ')}`,
      );
    }

    const findProductsWithNoQuantityAvailable = products.filter(product => {
      const currentQuantity =
        existentProducts.find(p => p.id === product.id)?.quantity || 0;

      return currentQuantity < product.quantity;
    });

    if (findProductsWithNoQuantityAvailable.length) {
      throw new AppError(
        `The quantity for product(s): ${findProductsWithNoQuantityAvailable
          .map(product => product.id)
          .join(', ')} is not available`,
      );
    }

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: existentProducts.find(p => p.id === product.id)?.price || 0,
    }));

    const order = await this.ordersRepository.create({
      customer: customerExists,
      products: serializedProducts,
    });

    const { order_products } = order;

    const updatedProductsQuantity = order_products.map(product => {
      const currentQuantity =
        existentProducts.find(p => p.id === product.product_id)?.quantity || 0;

      return {
        id: product.product_id,
        quantity: currentQuantity - product.quantity,
      };
    });

    await this.productsRepository.updateQuantity(updatedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
